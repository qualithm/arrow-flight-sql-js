import { Link } from "react-router-dom"

import useHttp from "../hook/useHttp"

export type Instatus = {
  page: {
    status: "UP" | "HASISSUES" | "UNDERMAINTENANCE"
  }
}

const socials = [
  {
    imageUrl: "https://cdn.qualithm.com/brand/discord.svg",
    name: "Discord",
    url: "https://discord.gg/KUv2dMjv4G"
  },
  {
    imageUrl: "https://cdn.qualithm.com/brand/youtube.svg",
    name: "YouTube",
    url: "https://youtube.com/@qualithm"
  },
  {
    imageUrl: "https://cdn.qualithm.com/brand/bluesky.svg",
    name: "Bluesky",
    url: "https://bsky.app/profile/qualithm.com"
  },
  {
    className: "dark:invert",
    imageUrl: "https://cdn.qualithm.com/brand/github.svg",
    name: "GitHub",
    url: "https://github.com/qualithm"
  }
]

function Footer() {
  const getInstatus = useHttp<null, Instatus>({
    auto: true,
    cache: "instatus",
    credentials: "same-origin",
    pollInterval: 60000,
    url: "https://qualithm.instatus.com/summary.json"
  })

  const status = {
    HASISSUES: "some systems have issues",
    UNDERMAINTENANCE: "some systems are under maintenance",
    UNKNOWN: "unknown status",
    UP: "all systems operational"
  }[getInstatus.data?.page.status ?? "UNKNOWN"]

  return (
    <footer className="safe-x-4 md:safe-x-6 flex-col gap-6 border-t border-[var(--border-dim)] p-6 text-center text-sm">
      <div className="items-center gap-6 md:flex-row md:justify-between">
        <nav className="flex-row flex-wrap items-center gap-6">
          <Link to={`${import.meta.env.VITE_URI_SITE}/legal/terms-of-service`}>
            Terms of Service
          </Link>
          <Link to={`${import.meta.env.VITE_URI_SITE}/legal/privacy-policy`}>Privacy Policy</Link>
          <Link to={`${import.meta.env.VITE_URI_SITE}/legal`}>Legal</Link>
        </nav>
        <nav className="flex-row items-center gap-6">
          {socials.map(({ className, imageUrl, name, url }) => (
            <Link key={name} className={`size-6 ${className ?? ""}`.trim()} title={name} to={url}>
              {imageUrl ? <img alt={name} src={imageUrl} /> : name}
            </Link>
          ))}
        </nav>
      </div>
      <div className="items-center gap-6 md:flex-row md:justify-between">
        <nav className="flex-row flex-wrap items-center gap-6">
          <span className="text-[var(--fg-dim)]">
            &copy; {new Date().getFullYear()} Qualithm Ltd.
          </span>
        </nav>
        <nav className="flex-row flex-wrap items-center gap-6">
          <a
            className="inline-flex items-center gap-1 capitalize data-[status=UNKNOWN]:text-[var(--fg-dim)]"
            data-status={getInstatus.data?.page.status ?? "UNKNOWN"}
            href="https://qualithm.instatus.com"
          >
            {status}
            <span className="material-symbol">arrow_outward</span>
          </a>
        </nav>
      </div>
    </footer>
  )
}

export default Footer
