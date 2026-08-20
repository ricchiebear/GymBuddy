document.addEventListener(
    "DOMContentLoaded",
    () => {

        const menuButton =
            document.querySelector(
                ".mobile-menu-button"
            );

        const navigationMenu =
            document.querySelector(
                ".navigation-menu"
            );

        if (
            !menuButton ||
            !navigationMenu
        ) {
            return;
        }

        menuButton.addEventListener(
            "click",
            () => {

                const isOpen =
                    navigationMenu
                        .classList
                        .toggle(
                            "navigation-menu-open"
                        );

                menuButton.setAttribute(
                    "aria-expanded",
                    String(isOpen)
                );

                const icon =
                    menuButton.querySelector(
                        ".mobile-menu-icon"
                    );

                if (icon) {

                    icon.textContent =
                        isOpen
                            ? "✕"
                            : "☰";
                }
            }
        );
    }
);