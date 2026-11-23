import { createFileRoute } from "@tanstack/react-router";
import { AccountForm } from "@/components/finsight/account-form";
import { pageHead } from "@/components/finsight/page-kit";
export const Route = createFileRoute("/register")({
    head: () => pageHead("Get access", "How FinSight workspaces and API clients are issued."),
    component: Register,
});
function Register() {
    return <AccountForm register />;
}
