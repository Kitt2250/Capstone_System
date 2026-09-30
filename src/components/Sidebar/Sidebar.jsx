
import { useState, useEffect } from "react";
import { NavLink } from "react-router";
import { onAuthStateChanged, signOut } from "firebase/auth";
import { auth } from "../../firebase/config";
import { getUserData } from "../../services/userServices";
import "./Sidebar.css";
import cherubimLogo from "../../assets/cherubim_logo.jpg";
import { LayoutGrid, Users, FileText, MapPin, Landmark, BarChart2, Settings, Database, LogOut, ChevronLeft, ChevronRight, CreditCard, Building2, Heart, Wallet, RefreshCw, Bell, User, ShieldAlert, Cross } from "lucide-react";
import { subscribeNotifications } from "../../services/notificationServices";

function Sidebar({ role = "admin" }) {
    const [isCollapsed, setIsCollapsed] = useState(false);
    const [userProfile, setUserProfile] = useState(null);
    const [unreadNotifCount, setUnreadNotifCount] = useState(0);

    useEffect(() => {
        const unsub = subscribeNotifications((data) => {
            const unread = (data || []).filter((n) => !n.is_read).length;
            setUnreadNotifCount(unread);
        }, "staff");
        return () => unsub();
    }, []);

    useEffect(() => {
        const unsubscribe = onAuthStateChanged(auth, async (user) => {

            if (!user) {
                setUserProfile(null);
                return;
            }

            try {
                const userData = await getUserData(user.uid);

                const name = userData?.name || user.displayName || user.email?.split("@")[0] || "User";
                const email = userData?.email || user.email || "";

                const initials = (name.trim() ? name.trim().split(/\s+/) : ["U"])
                    .map((n) => n[0])
                    .join("")
                    .toUpperCase()
                    .slice(0, 2) || "U";

                setUserProfile({
                    name,
                    email,
                    initials
                });

            } catch (error) {
                console.error("Failed to load user profile:", error);
                const fallbackName = user.displayName || user.email?.split("@")[0] || "User";
                const fallbackInitials = (fallbackName.trim() ? fallbackName.trim().split(/\s+/) : ["U"])
                    .map((n) => n[0])
                    .join("")
                    .toUpperCase()
                    .slice(0, 2) || "U";

                setUserProfile({
                    name: fallbackName,
                    email: user.email || "",
                    initials: fallbackInitials
                });
            }
        });

        return () => unsubscribe();
    }, []);

    const toggleCollapse = () => {
        const nextState = !isCollapsed;
        setIsCollapsed(nextState);
        localStorage.setItem("sidebar_collapsed", String(nextState));
    };

    const handleLogout = async () => {
        try {
            await signOut(auth);
        } catch (error) {
            console.error("Failed to sign out:", error);
        }
    };

    const navSections = {
        admin: [
            {
                title: "MAIN",
                links: [
                    { name: "Dashboard", path: "/admin", icon: LayoutGrid, exact: true },
                    { name: "User Management", path: "/admin/users-management", icon: Users },
                    { name: "Audit Logs", path: "/admin/audit-log", icon: FileText },
                    { name: "Map Availability", path: "/admin/map", icon: MapPin },
                    { name: "Grave Management", path: "/admin/grave-management", icon: Landmark }
                ]
            },
            {
                title: "MANAGEMENT",
                links: [
                    { name: "Reports", path: "/admin/reports", icon: BarChart2 },
                    { name: "Settings", path: "/admin/settings", icon: Settings },
                    { name: "Backup & Restore", path: "/admin/backup", icon: Database }
                ]
            },
            {
                title: "ADMIN CONFIGURATION",
                links: [
                    { name: "Admin Configuration", path: "/admin/admin-configuration", icon: ShieldAlert }
                ]
            }
        ],

        staff: [
            {
                title: "MAIN",
                links: [
                    { name: "Dashboard", path: "/staff", icon: LayoutGrid, exact: true },
                    { name: "Burials", path: "/staff/burials", icon: Landmark },
                    { name: "Interment", path: "/staff/interment", icon: Cross },
                    { name: "POS", path: "/staff/point-of-sale", icon: Wallet },
                    { name: "Payments", path: "/staff/payments", icon: CreditCard },
                    { name: "Wake Spaces", path: "/staff/wake-spaces", icon: Building2 }
                ]
            },
            {
                title: "MANAGEMENT",
                links: [
                    { name: "Renewals", path: "/staff/renewals", icon: RefreshCw },
                    { name: "Notifications", path: "/staff/notifications", icon: Bell },
                    { name: "My Accounts", path: "/staff/my-accounts", icon: User }
                ]
            }
        ],

        family: [
            {
                title: "MAIN",
                links: [
                    { name: "Dashboard", path: "/family", icon: LayoutGrid, exact: true },
                    { name: "My Family", path: "/family/my-family", icon: Users },
                    { name: "Memorial", path: "/family/memorial", icon: Heart },
                    { name: "Payments", path: "/family/payments", icon: CreditCard }
                ]
            }
        ]
    };

    const roleTitles = {
        admin: "Administrator Panel",
        staff: "Staff Panel",
        family: "Family Portal"
    };

    const activeSections = navSections[role] || navSections.admin;

    return (
        <aside className={`sidebar-container ${isCollapsed ? "collapsed" : ""}`}>
            <div className="sidebar-header">
                <div className="sidebar-brand-wrapper">

                    <div className="sidebar-logo-container" title="Cherubim of Heaven">
                        <img
                            src={cherubimLogo}
                            alt="Cherubim of Heaven Logo"
                            className="sidebar-logo-img"
                            onError={(e) => {
                                e.currentTarget.src = "/cherubim_logo.jpg";
                            }}
                        />
                    </div>

                    <div className="sidebar-brand-text">
                        <span className="sidebar-title">
                            Cherubim of Heaven
                        </span>

                        <span className="sidebar-subtitle">
                            {roleTitles[role] || "System Panel"}
                        </span>
                    </div>

                </div>

                <button
                    type="button"
                    className="sidebar-toggle-btn"
                    onClick={toggleCollapse}
                    title={isCollapsed ? "Expand sidebar" : "Collapse sidebar"}
                    aria-label={isCollapsed ? "Expand sidebar" : "Collapse sidebar"}
                >
                    {isCollapsed
                        ? <ChevronRight size={16} />
                        : <ChevronLeft size={16} />
                    }
                </button>
            </div>
            <div className="sidebar-nav-body">

                {activeSections.map((section, sIdx) => (
                    <div
                        key={section.title || sIdx}
                        className="sidebar-section"
                    >
                        <span className="sidebar-section-title">
                            {section.title}
                        </span>

                        <div className="sidebar-section-divider" />

                        {section.links.map((link) => {

                            const IconComponent = link.icon;

                            return (
                                <NavLink
                                    key={link.path}
                                    to={link.path}
                                    end={link.exact}
                                    className={({ isActive }) =>
                                        `sidebar-link ${isActive ? "active" : ""}`
                                    }
                                    data-tooltip={link.name}
                                    title={isCollapsed ? link.name : ""}
                                >
                                    <span className="sidebar-link-icon">
                                        <IconComponent
                                            size={20}
                                            strokeWidth={2}
                                        />
                                    </span>

                                    <span className="sidebar-link-label">
                                        {link.name}
                                    </span>

                                    {link.name === "Notifications" && unreadNotifCount > 0 && (
                                        <span className="sidebar-notif-pill">
                                            {unreadNotifCount > 99 ? "99+" : unreadNotifCount}
                                        </span>
                                    )}
                                </NavLink>
                            );
                        })}
                    </div>
                ))}

            </div>
            <div className="sidebar-footer">

                {userProfile && (
                    <>
                        <div className="sidebar-user-info-group">

                            <div
                                className="sidebar-user-avatar"
                                title={userProfile.name}
                            >
                                {userProfile.initials}
                            </div>

                            <div className="sidebar-user-details">

                                <span
                                    className="sidebar-user-name"
                                    title={userProfile.name}
                                >
                                    {userProfile.name}
                                </span>

                                <span
                                    className="sidebar-user-email"
                                    title={userProfile.email}
                                >
                                    {userProfile.email}
                                </span>

                            </div>

                        </div>

                        <button
                            type="button"
                            className="sidebar-logout-btn"
                            onClick={handleLogout}
                            title="Log Out"
                            aria-label="Log Out"
                        >
                            <LogOut
                                size={18}
                                strokeWidth={2.2}
                            />
                        </button>
                    </>
                )}

            </div>

        </aside>
    );
}

export default Sidebar;

