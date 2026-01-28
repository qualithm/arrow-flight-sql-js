import { useNavigate } from "react-router-dom"

import Seo from "../component/Seo"

function NotFound() {
  const navigate = useNavigate()

  return (
    <main>
      <Seo
        description="Qualithm Docs are your guide to connecting devices, managing data, and automating projects with ease."
        image="https://cdn.qualithm.com/asset/og-image-qualithm.png"
        imageAlt="Qualithm"
        imageHeight="630"
        imageWidth="1200"
        locale="en_NZ"
        siteName="Qualithm"
        title="Qualithm Docs &mdash; Not Found"
        type="website"
        url={import.meta.env.VITE_URI_DOCS}
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
