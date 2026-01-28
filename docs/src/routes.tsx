import type { RouteObject } from "react-router-dom"

import Page from "./component/Page"
import Account from "./page/Account"
import BillingAndUsage from "./page/BillingAndUsage"
import Dashboards from "./page/Dashboards"
import Devices from "./page/Devices"
import Error from "./page/Error"
import Exports from "./page/Exports"
import Functions from "./page/Functions"
import Home from "./page/Home"
import Http from "./page/Http"
import Logs from "./page/Logs"
import Members from "./page/Members"
import Mqtt from "./page/Mqtt"
import NotFound from "./page/NotFound"
import Roles from "./page/Roles"
import Rules from "./page/Rules"
import Sessions from "./page/Sessions"
import Spaces from "./page/Spaces"
import Teams from "./page/Teams"

export default [
  {
    path: "/",
    element: <Page />,
    children: [
      { element: <Account />, path: "account" },
      { element: <BillingAndUsage />, path: "billing-and-usage" },
      { element: <Dashboards />, path: "dashboards" },
      { element: <Devices />, path: "devices" },
      { element: <Exports />, path: "exports" },
      { element: <Functions />, path: "functions" },
      { element: <Home />, index: true },
      { element: <Http />, path: "http" },
      { element: <Logs />, path: "logs" },
      { element: <Members />, path: "members" },
      { element: <Mqtt />, path: "mqtt" },
      { element: <NotFound />, path: "*" },
      { element: <Roles />, path: "roles" },
      { element: <Rules />, path: "rules" },
      { element: <Sessions />, path: "sessions" },
      { element: <Spaces />, path: "spaces" },
      { element: <Teams />, path: "teams" }
    ],
    errorElement: <Error />
  }
] as RouteObject[]
