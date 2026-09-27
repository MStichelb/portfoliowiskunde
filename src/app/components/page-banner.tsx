import Image, { type StaticImageData } from "next/image";

import adminBanner from "@/app/header_admin.png";
import mainBanner from "@/app/header_main.png";
import portfolioBanner from "@/app/header_port.png";

const banners: Record<"admin" | "main" | "portfolio", StaticImageData> = {
  admin: adminBanner,
  main: mainBanner,
  portfolio: portfolioBanner,
};

export function PageBanner({ variant, customSrc }: { variant: keyof typeof banners; customSrc?: string }) {
  return <div className={`page-banner page-banner-${variant}`} aria-hidden="true">
    {customSrc
      // The authenticated asset route must be requested by the browser, not by the Next image optimizer.
      // eslint-disable-next-line @next/next/no-img-element
      ? <img className="page-banner-custom-image" src={customSrc} alt="" width="1600" height="360" />
      : <Image src={banners[variant]} alt="" priority sizes="(max-width: 1120px) calc(100vw - 32px), 1080px" />}
  </div>;
}
