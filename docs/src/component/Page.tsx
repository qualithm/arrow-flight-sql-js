import { Outlet, ScrollRestoration } from "react-router-dom"

import Footer from "./Footer"
import Header from "./Header"

function Page() {
  return (
    <>
      <ScrollRestoration />
      <Header />
      <Outlet />
      <Footer />
    </>
  )
}

export default Page
