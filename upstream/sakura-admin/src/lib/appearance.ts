import { createContext, useContext } from "react"

type Footer = { show: boolean; prefix: string; name: string; url: string }
type Overrides = {
    CustomTitle?: string
    CustomBackgroundImage?: string
    CustomMobileBackgroundImage?: string
    CustomLogo?: string
    CustomFavicon?: string
    CustomIllustration?: string
    CustomAvatar?: string
    CustomFooterPowered?: Partial<Footer>
    AdminCustomSiteName?: string
    AdminCustomBackgroundImage?: string
    AdminCustomMobileBackgroundImage?: string
    AdminCustomLogo?: string
    AdminCustomFavicon?: string
    AdminCustomIllustration?: string
    AdminCustomAvatar?: string
    AdminCustomFooterPowered?: Partial<Footer>
    __sakuraSyncAdminTheme?: () => void
    __sakuraSyncThemeConfig?: () => void
}
export const adminWindow = window as Window & Overrides
function asset(value: string | undefined, fallback: string) {
    if (value == null) return fallback
    if (typeof value !== "string" || !value.trim() || /["\\\r\n<>]/.test(value)) return ""
    try {
        return ["http:", "https:"].includes(new URL(value, location.origin).protocol) ? value : ""
    } catch {
        return ""
    }
}
export function readAppearance() {
    const w = adminWindow
    const background = asset(
        w.AdminCustomBackgroundImage ?? w.CustomBackgroundImage,
        "/dashboard/sakura/background.jpg",
    )
    const footer = w.AdminCustomFooterPowered ?? w.CustomFooterPowered
    return {
        title: w.AdminCustomSiteName ?? w.CustomTitle ?? "Sakura Monitoring",
        logo: asset(w.AdminCustomLogo ?? w.CustomLogo, "/dashboard/sakura/logo.svg"),
        avatar: asset(w.AdminCustomAvatar ?? w.CustomAvatar, "/dashboard/sakura/avatar.png"),
        illustration: asset(
            w.AdminCustomIllustration ?? w.CustomIllustration,
            "/dashboard/sakura/illustration.webp",
        ),
        favicon: asset(w.AdminCustomFavicon ?? w.CustomFavicon, "/dashboard/sakura/favicon.ico"),
        background,
        mobile: asset(
            w.AdminCustomMobileBackgroundImage ?? w.CustomMobileBackgroundImage,
            background,
        ),
        footer: {
            show: footer?.show ?? true,
            prefix: footer?.prefix ?? "Powered by",
            name: footer?.name ?? "VAMPIRE",
            url: asset(footer?.url, "https://github.com/VAMPIRE0924"),
        },
    }
}
export const AppearanceContext = createContext(readAppearance())
export const useAppearance = () => useContext(AppearanceContext)
