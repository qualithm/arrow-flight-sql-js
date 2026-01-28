import { useState } from "react"
import { Link } from "react-router-dom"

import useOutsideClick from "../hook/useOutsideClick"
// import Logo from "./Logo"

function Header() {
  const [menu, setMenu] = useState<string | null>(null)

  const menuRef = useOutsideClick<HTMLDivElement>({ disabled: !menu }, () => {
    setMenu(null)
  })

  const closeMenu = () => {
    setMenu(null)
  }

  const toggleMenu = (name: string) => {
    if (menu === name) {
      setMenu(null)
      return
    } else {
      setMenu(name)
    }
  }

  return (
    <header
      ref={menuRef}
      className="safe-x-2 md:safe-x-4 sticky top-[env(safe-area-inset-top)] z-50 flex-row py-2 landscape:top-0"
      onClick={closeMenu}
    >
      <div className="flex-1">
        <Link
          className="pill-md pill-glass self-start text-[var(--fg-bright)]"
          to={import.meta.env.VITE_URI_BASE}
          onClick={closeMenu}
        >
          <span className="inline-flex items-center font-bold gap-2 ">
            {/* <Logo className="size-8" /> */}
            Arrow Flight SQL JS
          </span>
        </Link>
      </div>
      <div className="flex-row items-center gap-6">
        <button
          className="pill-md pill-glass data-[active=true]:bg-glass-extreme text-2xl text-[var(--fg-bright)]"
          data-active={menu === "main" ? "true" : "false"}
          onClick={(e) => {
            e.stopPropagation()
            toggleMenu("main")
          }}
        >
          <span className="inline-flex items-center">
            <span className="material-symbol">menu</span>&zwnj;
          </span>
        </button>
      </div>
      {menu === "main" && (
        <div className="safe-x-2 md:safe-x-4 absolute inset-x-0 top-full justify-end">
          <div
            className="bg-glass-bright shadow-soft max-h-[calc(100vh-3.5rem-2px-1rem)] w-full justify-start self-end overflow-y-auto rounded-2xl border border-[var(--border-dim)] py-6 sm:max-w-xs"
            onClick={(e) => {
              e.stopPropagation()
            }}
          >
            <nav className="gap-2 px-3">{/* TODO: Add more menu items here */}</nav>
            <hr />
            <nav className="gap-2 px-3">{/* TODO: Add more menu items here */}</nav>
          </div>
        </div>
      )}
    </header>
  )
}

export default Header
