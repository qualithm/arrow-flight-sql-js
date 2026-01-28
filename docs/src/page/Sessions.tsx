import Seo from "../component/Seo"

function Sessions() {
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
        title="Qualithm Docs &mdash; Sessions"
        type="website"
        url={import.meta.env.VITE_URI_DOCS}
      />
      <div className="safe-x-4 md:safe-x-6 mx-auto w-full max-w-3xl">
        <h1>Sessions</h1>
      </div>
    </main>
  )
}

export default Sessions
