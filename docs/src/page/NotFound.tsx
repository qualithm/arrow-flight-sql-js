import { useNavigate } from "react-router-dom"

import Seo from "../component/Seo"

function NotFound() {
  const navigate = useNavigate()

  return (
    <main>
      <Seo
        description="Arrow Flight SQL JS"
        image="https://cdn.qualithm.com/asset/og-image-qualithm.png"
        imageAlt="Qualithm"
        imageHeight="630"
        imageWidth="1200"
        locale="en_NZ"
        siteName="Qualithm"
        title="Arrow Flight SQL JS &mdash; Not Found"
        type="website"
        url={import.meta.env.VITE_URI_BASE}
      />
      <div className="safe-x-4 md:safe-x-6 w-full max-w-md flex-1 items-center py-6">
        <p>The page you&rsquo;re looking for doesn&rsquo;t exist.</p>
        <p>
          <button className="pill-md pill-ghost" onClick={() => void navigate(-1)}>
            <span className="material-symbol">chevron_left</span> Return
          </button>
        </p>
      </div>
    </main>
  )
}

export default NotFound
