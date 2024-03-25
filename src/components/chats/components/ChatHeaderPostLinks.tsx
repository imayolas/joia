import { TabEnum, getTabForRoute } from '@/components/posts/postsNavigation'
import { Skeleton } from '@/components/ui/skeleton'
import { useNavigation } from '@/lib/frontend/useNavigation'
import { cn } from '@/lib/utils'
import { Cog6ToothIcon } from '@heroicons/react/24/outline'
import { Cog6ToothIcon as Cog6ToothIconSolid } from '@heroicons/react/24/solid'
import Link from 'next/link'
import { ChatHeaderSharePopover } from './ChatHeaderSharePopover'

export const ChatHeaderPostLinks = () => {
  const navigation = useNavigation()

  const postId = navigation.query.post_id as string | undefined
  const chatId = navigation.query.chat_id as string | undefined

  const activeTab = getTabForRoute(navigation.route)

  const chatLink = postId && chatId ? `/p/${postId}/c/${chatId}` : '#'
  const configLink =
    postId && chatId ? `/p/${postId}/c/${chatId}/configuration` : '#'

  return (
    <nav className="flex items-center gap-x-4 text-sm text-zinc-900">
      {!postId && <Skeleton className="h-3 w-36" />}
      {postId && (
        <>
          <ul className="flex items-center">
            <li className={cn('mr-4 flex items-center text-zinc-700')}>
              <ChatHeaderSharePopover postId={postId} />
            </li>
            <Link
              href={activeTab === TabEnum.Configuration ? chatLink : configLink}
            >
              <li
                className={cn(
                  'rounded p-1 transition hover:bg-zinc-200/80',
                  activeTab === TabEnum.Configuration && 'bg-zinc-200',
                )}
              >
                <div
                  className={cn(
                    'cursor-pointer rounded-full border p-1',
                    activeTab === TabEnum.Configuration
                      ? 'border-zinc-600 bg-zinc-200'
                      : 'border-zinc-500',
                  )}
                >
                  {activeTab === TabEnum.Configuration ? (
                    <Cog6ToothIconSolid className="h-4 w-4 text-zinc-600" />
                  ) : (
                    <Cog6ToothIcon className="h-4 w-4 text-zinc-500" />
                  )}
                </div>
              </li>
            </Link>
          </ul>
        </>
      )}
    </nav>
  )
}
