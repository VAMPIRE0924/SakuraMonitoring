import Header from "@/components/header"
import { ThemeProvider } from "@/components/theme-provider"
import { Toaster } from "@/components/ui/sonner"
import useSetting from "@/hooks/useSetting"
import { AppearanceContext, adminWindow, readAppearance } from "@/lib/appearance"
import i18n from "@/lib/i18n"
import { InjectContext } from "@/lib/inject"
import { useEffect, useLayoutEffect, useState } from "react"
import { Outlet, useLocation } from "react-router-dom"

export default function Root() {
    const [appearance, setAppearance] = useState(readAppearance)
    const { pathname } = useLocation()
    const { footer } = appearance
    const { data: settingData, error } = useSetting()

    useLayoutEffect(() => {
        const sync = () => setAppearance(readAppearance())
        adminWindow.__sakuraSyncAdminTheme = adminWindow.__sakuraSyncThemeConfig = sync
        return () => {
            delete adminWindow.__sakuraSyncAdminTheme
            delete adminWindow.__sakuraSyncThemeConfig
        }
    }, [])
    useLayoutEffect(() => {
        document.body.dataset.nzAdminPage =
            pathname.replace(/\/+$/, "") === "/dashboard/login" ? "login" : "panel"
        document.body.dataset.nzAdminRoute = /^\/dashboard\/terminal(?:\/|$)/.test(pathname)
            ? "terminal"
            : "default"
    }, [pathname])
    useLayoutEffect(() => {
        document.title = appearance.title
        const icon = document.getElementById("sakura-favicon") as HTMLLinkElement | null
        if (icon) icon.href = appearance.favicon
        const style = document.documentElement.style
        style.setProperty(
            "--nz-admin-bg-image",
            appearance.background ? `url("${appearance.background}")` : "none",
        )
        style.setProperty(
            "--nz-admin-mobile-bg-image",
            appearance.mobile ? `url("${appearance.mobile}")` : "none",
        )
    }, [appearance])

    useEffect(() => {
        if (settingData?.config?.custom_code_dashboard) {
            void InjectContext(settingData.config.custom_code_dashboard).then(() => {
                setAppearance(readAppearance())
            })
        }
    }, [settingData?.config?.custom_code_dashboard])

    useEffect(() => {
        if (settingData?.config?.language && !localStorage.getItem("language")) {
            i18n.changeLanguage(settingData?.config?.language)
        }
    }, [settingData?.config?.language])

    if (error) {
        throw error
    }

    if (!settingData) {
        return null
    }

    return (
        <AppearanceContext.Provider value={appearance}>
            <ThemeProvider defaultTheme="system" storageKey="vite-ui-theme">
                <section className="text-sm mx-auto h-full flex flex-col justify-between">
                    <div>
                        <Header />
                        <div className="max-w-5xl mx-auto">
                            <Outlet />
                        </div>
                    </div>
                    {footer.show && (
                        <footer
                            data-nz-admin-footer="true"
                            className="mx-5 py-5 text-foreground/50 font-light text-xs text-center"
                        >
                            <span data-nz-admin-footer-content="true">
                                {footer.name && (
                                    <>
                                        {footer.prefix}{" "}
                                        {footer.url ? (
                                            <a
                                                href={footer.url}
                                                target="_blank"
                                                rel="noopener noreferrer"
                                            >
                                                {footer.name}
                                            </a>
                                        ) : (
                                            footer.name
                                        )}
                                    </>
                                )}
                            </span>
                        </footer>
                    )}
                </section>
                <Toaster />
            </ThemeProvider>
        </AppearanceContext.Provider>
    )
}
