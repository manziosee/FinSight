import { createFileRoute } from "@tanstack/react-router";
import { AccountForm } from "@/components/finsight/account-form";
import { pageHead } from "@/components/finsight/page-kit";
export const Route = createFileRoute("/login")({
    head: () =>
        pageHead(
            "Sign in",
            "Sign in to your FinSight workspace with your organisation's API client.",
        ),
    component: Login,
});
function Login() {
    return <AccountForm />;
}
