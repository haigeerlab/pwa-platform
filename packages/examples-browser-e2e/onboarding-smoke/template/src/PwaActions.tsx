// Copied literally from website/start/react.md step 3.
import { usePwa } from "@pwa-platform/react";
import { useState } from "react";

export function PwaActions() {
  const pwa = usePwa();
  const [installAttempted, setInstallAttempted] = useState(false);
  return (
    <>
      {pwa.state.installEligible && !installAttempted && (
        <button
          type="button"
          onClick={() => {
            setInstallAttempted(true);
            void pwa.promptInstall().catch((error: unknown) => {
              console.error("PWA 安装提示失败", error);
            });
          }}
        >
          安装应用
        </button>
      )}
      {pwa.state.updateWaiting && (
        <button
          type="button"
          onClick={() => {
            void pwa.applyUpdate().catch((error: unknown) => {
              console.error("PWA 更新接管失败", error);
            });
          }}
        >
          应用更新
        </button>
      )}
    </>
  );
}
