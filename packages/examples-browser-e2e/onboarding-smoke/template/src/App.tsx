// A minimal existing App a newcomer would already have; the doc says to import and render PwaActions in it.
import { PwaActions } from "./PwaActions";

export default function App() {
  return (
    <div>
      {/* id used by the onboarding smoke test to prove the offline app shell rendered, not a blank page. */}
      <h1 id="app-shell-heading">Onboarding Smoke App</h1>
      <PwaActions />
    </div>
  );
}
