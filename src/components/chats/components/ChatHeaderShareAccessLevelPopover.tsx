import { useAccessLevelForPost } from '@/components/permissions/permissionsHooks'
import { usePostShareUpdateAccessLevel } from '@/components/posts/postsHooks'
import { useSuccessToast } from '@/components/ui/toastHooks'
import { cn } from '@/lib/utils'
import { UserAccessLevelActions } from '@/shared/globalTypes'
import { Popover, Transition } from '@headlessui/react'
import { ChevronDownIcon } from '@heroicons/react/20/solid'
import { CheckIcon } from '@heroicons/react/24/solid'

const permissionLevelOptions = [
  {
    title: 'Owner',
    value: UserAccessLevelActions.Owner,
    description: 'All permissions, including deletion',
    disabled: true,
  },
  {
    title: 'Edit and share',
    value: UserAccessLevelActions.EditAndShare,
    description: 'Use, edit and share with others',
  },
  {
    title: 'Use',
    value: UserAccessLevelActions.Use,
    description: 'Create and run chats',
  },
  {
    title: 'View',
    value: UserAccessLevelActions.View,
    description: 'View existing chats only',
  },
  {
    title: 'Remove',
    description: "Remove this person's access",
    value: UserAccessLevelActions.Remove,
  },
]

export const ChatHeaderShareAccessLevelPopover = ({
  postId,
  shareId,
  activeAccessLevel,
}: {
  postId: string
  activeAccessLevel: UserAccessLevelActions
  shareId: string
}) => {
  const { mutate: updateAccessLevel } = usePostShareUpdateAccessLevel()

  const toast = useSuccessToast()
  const { accessLevel } = useAccessLevelForPost(postId)

  if (!accessLevel) {
    return null
  }

  return (
    <Popover>
      {({ open, close }) => {
        const handleClickFor =
          (clickedAccessLevel: UserAccessLevelActions) => () => {
            updateAccessLevel(
              { shareId, accessLevel: clickedAccessLevel },
              {
                onSuccess: () => {
                  if (clickedAccessLevel === UserAccessLevelActions.Remove) {
                    toast(undefined, 'Access removed')
                  } else {
                    toast(undefined, 'Access level updated')
                  }
                  close()
                },
              },
            )
          }

        const targetOption = permissionLevelOptions.find((option) => {
          return option.value === activeAccessLevel
        })

        return (
          <>
            <Popover.Button
              className={cn(
                'font-medium',
                activeAccessLevel === UserAccessLevelActions.Owner &&
                  'cursor-default',
              )}
              disabled={activeAccessLevel === UserAccessLevelActions.Owner}
            >
              <div className="flex items-center gap-x-1 text-xs text-zinc-400">
                {targetOption?.title}

                <ChevronDownIcon
                  className={cn(
                    'h-3 w-3',
                    open && 'rotate-180 transform',
                    activeAccessLevel === UserAccessLevelActions.Owner &&
                      'invisible',
                  )}
                />
              </div>
            </Popover.Button>
            <Transition
              enter="transition duration-200"
              enterFrom="opacity-0 transform translate-y-0"
              enterTo="opacity-100 transform translate-y-[8px]"
              leave="transition duration-200"
              leaveFrom="opacity-100 transform translate-y-[8px]"
              leaveTo="opacity-0 transform translate-y-0"
            >
              <Popover.Panel
                static
                className="absolute right-0 top-0 min-w-[250px] space-y-1 rounded-md border  border-zinc-300 bg-white p-1 drop-shadow-xl"
              >
                {permissionLevelOptions.map((option) => {
                  const isActive = activeAccessLevel === option.value

                  return (
                    <div
                      key={option.title}
                      onClick={
                        option.disabled
                          ? () => {
                              handleClickFor // dummy function to avoid eslint error
                            }
                          : handleClickFor(option.value)
                      }
                      className={cn(
                        'flex  items-center justify-between rounded px-2 py-1 ',
                        isActive && 'bg-zinc-100',
                        !option.disabled && 'cursor-pointer hover:bg-zinc-200',
                        option.disabled && 'cursor-not-allowed opacity-50',
                      )}
                    >
                      <div>
                        <div
                          className={cn(
                            'font-medium',
                            option.value === UserAccessLevelActions.Remove
                              ? 'text-red-600'
                              : 'text-zinc-600',
                          )}
                        >
                          {option.title}
                        </div>
                        <div
                          className={cn(
                            'text-xs',
                            option.value === UserAccessLevelActions.Remove
                              ? 'text-red-400'
                              : 'text-zinc-400',
                          )}
                        >
                          {option.description}
                        </div>
                      </div>
                      {isActive && <CheckIcon className="h-5 w-5" />}
                    </div>
                  )
                })}
              </Popover.Panel>
            </Transition>
          </>
        )
      }}
    </Popover>
  )
}
