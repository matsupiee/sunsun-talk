import {
  createRootRoute,
  createRoute,
  createRouter,
  Outlet,
} from "@tanstack/react-router";
import { TalkPage } from "./features/talk/TalkPage";

const rootRoute = createRootRoute({
  component: () => <Outlet />,
});

const talkRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/",
  component: TalkPage,
});

const routeTree = rootRoute.addChildren([talkRoute]);

export const router = createRouter({
  routeTree,
  defaultPreload: "intent",
  scrollRestoration: true,
});

declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router;
  }
}
