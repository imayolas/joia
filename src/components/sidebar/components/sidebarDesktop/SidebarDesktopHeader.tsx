import { useGlobalState } from '@/components/global/globalState'
import { SidebarFooterUserSettingsDropdown } from '../Sidebar/SidebarFooter/SidebarFooterUserSettingsDropdown'
import { SidebarToggleIcon } from '../SidebarToggleIcon'

export function SidebarDesktopHeader() {
  const { toggleDesktopSidebar } = useGlobalState()

  return (
    <div className="flex h-12 shrink-0 items-center justify-between gap-x-4 border-b border-zinc-200/50 px-4">
      <SidebarFooterUserSettingsDropdown />

      <button
        type="button"
        className="-m-2.5 hidden p-2.5 text-zinc-700 lg:block"
        onClick={toggleDesktopSidebar}
      >
        <span className="sr-only">Open sidebar</span>
        <SidebarToggleIcon />
      </button>
    </div>
  )
}
