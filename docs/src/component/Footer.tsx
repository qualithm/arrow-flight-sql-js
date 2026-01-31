import { Link } from "react-router-dom"

const socials = [
  {
    className: "dark:invert",
    imageUrl: "https://cdn.qualithm.com/brand/github.svg",
    name: "GitHub",
    url: "https://github.com/qualithm/arrow-flight-sql-js"
  }
]

function Footer() {
  return (
    <footer className="safe-x-4 md:safe-x-6 flex-col gap-6 border-t border-[var(--border-dim)] p-6 text-center text-sm">
      <div className="items-center gap-6 md:flex-row md:justify-between">
        <nav className="flex-row flex-wrap items-center gap-6">
          <span className="text-[var(--fg-dim)]">
            &copy; {new Date().getFullYear()} Qualithm Ltd.
          </span>
        </nav>
        <nav className="flex-row items-center gap-6">
          {socials.map(({ className, imageUrl, name, url }) => (
            <Link key={name} className={`size-6 ${className}`.trim()} title={name} to={url}>
              {imageUrl ? <img alt={name} src={imageUrl} /> : name}
            </Link>
          ))}
        </nav>
      </div>
    </footer>
  )
}

export default Footer
