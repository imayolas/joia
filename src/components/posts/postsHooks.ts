import { api } from '@/lib/api'
import { useNavigation } from '@/lib/frontend/useNavigation'
import { serialDebouncer } from '@/lib/utils'
import { produce } from 'immer'
import { useEffect, useMemo, useRef } from 'react'
import { throttle } from 'underscore'
import { useErrorHandler } from '../global/errorHandlingHooks'
import { usePostsForSidebar } from '../sidebar/sidebarHooks'
import { useCurrentWorkspace } from '../workspaces/workspacesHooks'
import type { PostUpdateInput } from './postsTypes'

export const useDefaultPost = () => {
  const errorHandler = useErrorHandler()
  const { workspace } = useCurrentWorkspace()

  return api.posts.getDefault.useQuery(
    { workspaceId: workspace?.id! },
    {
      enabled: !!workspace?.id,
      onError: errorHandler(),
      refetchOnMount: false,
      refetchOnWindowFocus: false,
      staleTime: Infinity,
    },
  )
}

export const useIsDefaultPost = (postId?: string) => {
  const { data: defaultPost } = useDefaultPost()

  if (!defaultPost || !postId) return

  return defaultPost.id === postId
}

export const useCreatePost = () => {
  const errorHandler = useErrorHandler()
  const navigation = useNavigation()
  const utils = api.useContext()
  const { mutate, isLoading, ...rest } = api.posts.create.useMutation({
    onError: errorHandler(),
    onSuccess: (post) => {
      // Important: Invalidate the entire sidebar cache!
      void utils.sidebar.invalidate()
      void navigation.push(
        `/p/:postId/c/:chatId/configuration`,
        {
          postId: post.id,
          chatId: post.firstChatId,
        },
        {
          focus: 'system_message',
          backButton: false,
        },
      )
    },
  })

  type MutateArgs = Parameters<typeof mutate>
  type Params = MutateArgs[0]
  type Options = MutateArgs[1]

  const throttledMutate = throttle((params: Params, options?: Options) => {
    if (isLoading) return
    return mutate(params, options)
  }, 2000)

  return {
    mutate: throttledMutate,
    isLoading,
    ...rest,
  }
}

// Todo: Decouple from postsForSidebar; via events maybe??
// https://chat.openai.com/c/a06effd9-c3bd-4b15-bfad-697133cb02b6
export const useUpdatePost = (debounceMs = 0) => {
  const errorHandler = useErrorHandler()
  const { sidebar: sidebarRouter, posts: postsRouter } = api.useContext()

  const { postsForSidebar } = sidebarRouter
  const { getById: getPostById } = postsRouter
  const postsForSidebarRef = useRef(postsForSidebar)
  const getPostByIdRef = useRef(getPostById)

  const { mutate, ...rest } = api.posts.update.useMutation({
    onError: errorHandler(),
  })
  const { workspace } = useCurrentWorkspace()

  const debounced = useMemo(() => {
    const _debounced = serialDebouncer((params: PostUpdateInput) => {
      mutate(params)
    }, debounceMs)

    return (params: PostUpdateInput) => {
      postsForSidebarRef.current.setData(
        { workspaceId: workspace?.id! },
        (previous) => {
          if (!previous) return previous
          return produce(previous, (draft) => {
            const index = previous.findIndex((item) => item.id === params.id)
            const draftPost = draft[index]

            // Done manually to avoid weird code with type errors.
            if (draftPost) {
              if (params.title) {
                draftPost.title = params.title
              }

              if (params.emoji) {
                draftPost.emoji = params.emoji
              }
            }
          })
        },
      )

      getPostByIdRef.current.setData({ id: params.id }, (previous) => {
        if (!previous) return previous

        // Done manually to avoid werid code with type errors.
        return produce(previous, (draftPost) => {
          if (params.emoji) {
            draftPost.emoji = params.emoji
          }
          if (params.title) {
            draftPost.title = params.title
          }
        })
      })

      _debounced(params)
    }
  }, [debounceMs, workspace, postsForSidebarRef, getPostByIdRef, mutate])

  return {
    mutate: debounced,
    ...rest,
  }
}

export const useDeletePost = () => {
  const errorHandler = useErrorHandler()
  const navigation = useNavigation()
  const utils = api.useContext()
  const { workspace } = useCurrentWorkspace()

  const { sortedPosts } = usePostsForSidebar(workspace?.id)
  const routerPostId = navigation.query.post_id as string | undefined

  const { isSuccess, reset, mutate, ...rest } = api.posts.delete.useMutation({
    onError: errorHandler(),
    onSuccess: async () => {
      // Important: Invalidate the entire sidebar cache!
      await utils.sidebar.invalidate()
    },
  })

  useEffect(() => {
    if (isSuccess) {
      reset()
    }
  }, [isSuccess, reset])

  type MutateArgs = Parameters<typeof mutate>
  type Params = MutateArgs[0]
  type Options = MutateArgs[1]

  return {
    mutate: async (params: Params, options?: Options) => {
      if (!sortedPosts) return
      if (!workspace?.id) return
      if (routerPostId === params.id) {
        const deletableSortedPostIndex = sortedPosts.findIndex(
          (post) => post.id === params.id,
        )

        if (deletableSortedPostIndex > 0) {
          const targetPost = sortedPosts[deletableSortedPostIndex - 1]

          if (!targetPost?.firstChatId) return

          await navigation.replace(`/p/:postId/c/:chatId`, {
            postId: targetPost.id,
            chatId: targetPost.firstChatId,
          })
        } else if (deletableSortedPostIndex < sortedPosts.length - 1) {
          const targetPost = sortedPosts[deletableSortedPostIndex + 1]

          if (!targetPost?.firstChatId) return

          await navigation.replace(`/p/:postId/c/:chatId`, {
            postId: targetPost.id,
            chatId: targetPost.firstChatId,
          })
        } else {
          await navigation.replace('/w/:workspaceId/empty', {
            workspaceId: workspace.id,
          })
        }
      }

      mutate(params, options)
    },
    isSuccess,
    reset,
    ...rest,
  }
}

export const usePostById = (postId?: string) => {
  const errorHandler = useErrorHandler()

  return api.posts.getById.useQuery(
    {
      id: postId!,
    },
    { onError: errorHandler(), enabled: !!postId },
  )
}

export const usePostShares = (postId?: string) => {
  const errorHandler = useErrorHandler()

  return api.posts.getShares.useQuery(
    { postId: postId! },
    {
      onError: errorHandler(),
      enabled: !!postId,
    },
  )
}

export const useLatestPostConfigVersionForPost = (postId?: string) => {
  const errorHandler = useErrorHandler()

  return api.posts.getLatestConfig.useQuery(
    { postId: postId! },
    {
      onError: errorHandler(),
      enabled: !!postId,
    },
  )
}

export const usePostConfigUpdate = () => {
  const errorHandler = useErrorHandler()
  const utils = api.useContext()

  return api.posts.updateConfig.useMutation({
    onError: errorHandler(),
    onSuccess: () => {
      void utils.posts.getLatestConfig.invalidate()
    },
  })
}

export const usePostSharePerform = () => {
  const errorHandler = useErrorHandler()
  const utils = api.useContext()

  return api.posts.share.useMutation({
    onError: errorHandler(),
    onSuccess: () => {
      void utils.posts.getShares.invalidate()
    },
    retry: false,
  })
}
export const usePostShareUpdateAccessLevel = () => {
  const errorHandler = useErrorHandler()
  const utils = api.useContext()
  const { mutate } = api.posts.updateShareAccessLevel.useMutation({
    onError: errorHandler(),
    onSuccess: () => {
      void utils.posts.getShares.invalidate()
    },
  })
  return {
    mutate,
  }
}

export const useLatestPost = (workspaceId?: string) => {
  const errorHandler = useErrorHandler()

  return api.posts.getLatestPost.useQuery(
    { workspaceId: workspaceId! },
    {
      onError: errorHandler(),
      enabled: !!workspaceId,
    },
  )
}
