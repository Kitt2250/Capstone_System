import { useState, useEffect } from "react";
import { Outlet } from "react-router";
import { onAuthStateChanged } from "firebase/auth";
import { auth } from "../../firebase/config";
import Sidebar from "../../components/Sidebar/Sidebar";
import ActivateAccountModal from "../../components/Modals/ActivateAccountModal/ActivateAccountModal";
import { subscribeClientActivation } from "../../services/clientServices";

function Family() {
    const [activationState, setActivationState] = useState({
        needsActivation: false,
        clientDoc: null,
        userDoc: null,
        loading: true,
    });

    useEffect(() => {
        let unsubActivation = () => {};

        const setupListener = (currentUser) => {
            unsubActivation();

            if (!currentUser) {
                setActivationState({
                    needsActivation: false,
                    clientDoc: null,
                    userDoc: null,
                    loading: false,
                });
                return;
            }

            unsubActivation = subscribeClientActivation(currentUser, (state) => {
                setActivationState(state);
            });
        };

        // Immediately listen if auth.currentUser already resolved in App.jsx
        if (auth.currentUser) {
            setupListener(auth.currentUser);
        }

        const unsubAuth = onAuthStateChanged(auth, (currentUser) => {
            setupListener(currentUser);
        });

        return () => {
            unsubActivation();
            unsubAuth();
        };
    }, []);

    const { needsActivation, clientDoc, userDoc } = activationState;

    return (
        <>
            <div
                className="layout-container"
                style={
                    needsActivation
                        ? {
                              pointerEvents: "none",
                              userSelect: "none",
                              filter: "blur(2.5px)",
                              transition: "filter 0.3s ease",
                          }
                        : {}
                }
                aria-hidden={needsActivation}
            >
                <Sidebar role="family" />
                <main className="layout-content">
                    <Outlet />
                </main>
            </div>

            {/* Non-closeable Change Password modal for first-time / inactive clients */}
            <ActivateAccountModal
                isOpen={needsActivation}
                clientDoc={clientDoc}
                userDoc={userDoc}
                onActivated={() => {
                    setActivationState((prev) => ({
                        ...prev,
                        needsActivation: false,
                    }));
                }}
            />
        </>
    );
}

export default Family;