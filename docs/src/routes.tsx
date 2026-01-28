import type { RouteObject } from "react-router-dom"

import Page from "./component/Page"
import Error from "./page/Error"
import Home from "./page/Home"
import NotFound from "./page/NotFound"

export default [
  {
    path: "/",
    element: <Page />,
    children: [
      { element: <Home />, index: true },
      { element: <NotFound />, path: "*" }
    ],
    errorElement: <Error />
  }
] as RouteObject[]
