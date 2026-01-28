import { Link } from "react-router-dom"

function Error() {
  return (
    <main>
      <div className="safe-x-4 md:safe-x-6 w-full max-w-md flex-1 items-center py-6">
        <p>The application has encountered an error.</p>
        <p>
          <Link className="pill-md pill-outline" to="/">
            <span className="material-symbol">chevron_left</span> Return
          </Link>
        </p>
      </div>
    </main>
  )
}

export default Error
