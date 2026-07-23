import { lazy, Suspense } from "react";
import {
  createRootRoute,
  createRoute,
  createRouter,
  Outlet,
} from "@tanstack/react-router";
import { TalkPage } from "./features/talk/page";

const rootRoute = createRootRoute({
  component: () => <Outlet />,
});

const talkRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/",
  component: TalkPage,
});

// Three.js を含む 3D ページは重いので、/3d を開いたときだけ読み込む。
const ModelPage = lazy(() =>
  import("./features/model/page").then((m) => ({ default: m.ModelPage })),
);

const modelRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/3d",
  component: () => (
    <Suspense
      fallback={
        <div
          style={{
            display: "grid",
            placeItems: "center",
            minHeight: "100svh",
            background: "#FBF4E1",
            color: "#a48a55",
            fontWeight: 700,
          }}
        >
          スンスンを よびだし中…
        </div>
      }
    >
      <ModelPage />
    </Suspense>
  ),
});

const routeTree = rootRoute.addChildren([talkRoute, modelRoute]);

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
