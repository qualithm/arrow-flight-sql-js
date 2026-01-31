import Seo from "../component/Seo"

function Home() {
  return (
    <main>
      <Seo
        description="Arrow Flight SQL JS Docs"
        image="https://cdn.qualithm.com/asset/og-image-qualithm.png"
        imageAlt="Qualithm"
        imageHeight="630"
        imageWidth="1200"
        locale="en_NZ"
        siteName="Qualithm"
        title="Arrow Flight SQL JS Docs"
        type="website"
        url={import.meta.env.BASE_URL}
      />
      <div className="safe-x-4 md:safe-x-6 mx-auto w-full max-w-3xl">{/* Content goes here */}</div>
    </main>
  )
}

export default Home
