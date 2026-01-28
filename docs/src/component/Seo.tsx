type SeoProps = {
  description?: string
  image?: string
  imageAlt?: string
  imageHeight?: string
  imageWidth?: string
  locale?: string
  siteName?: string
  title?: string
  type?: string
  url?: string
}

function Seo({
  description,
  image,
  imageAlt,
  imageHeight,
  imageWidth,
  locale,
  siteName,
  title,
  type,
  url
}: SeoProps) {
  return (
    <>
      <title>{title}</title>
      <link href={url} rel="canonical" />
      <meta content={description} name="description" />
      <meta content={title} property="og:title" />
      <meta content={type} property="og:type" />
      <meta content={url} property="og:url" />
      <meta content={image} property="og:image" />
      <meta content={imageWidth} property="og:image:width" />
      <meta content={imageHeight} property="og:image:height" />
      <meta content={imageAlt} property="og:image:alt" />
      <meta content={description} property="og:description" />
      <meta content={siteName} property="og:site_name" />
      <meta content={locale} property="og:locale" />
    </>
  )
}

export default Seo
