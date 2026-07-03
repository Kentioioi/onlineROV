import { createBrowserRouter, createRoutesFromElements, Navigate, Route } from "react-router-dom";
import { AppLayout } from "@/components/layout/AppLayout";
import { RequireAuth } from "@/components/layout/RequireAuth";
import { LoginPage } from "@/pages/LoginPage";
import { PortalPage } from "@/pages/PortalPage";
import { ReportFormPage } from "@/pages/ReportFormPage";
import { ReportDetailPage } from "@/pages/ReportDetailPage";
import { ReportsListPage } from "@/pages/ReportsListPage";
import { SettingsPage } from "@/pages/SettingsPage";

// A data router (createBrowserRouter) rather than <BrowserRouter> because
// the report form's unsaved-changes guard uses useBlocker, which only works
// with data routers.
export const router = createBrowserRouter(
  createRoutesFromElements(
    <>
      <Route path="/login" element={<LoginPage />} />
      <Route element={<RequireAuth />}>
        <Route element={<AppLayout />}>
          <Route path="/" element={<PortalPage />} />
          <Route path="/reports" element={<ReportsListPage />} />
          <Route path="/reports/new" element={<ReportFormPage mode="create" />} />
          <Route path="/reports/:id" element={<ReportDetailPage />} />
          <Route path="/reports/:id/edit" element={<ReportFormPage mode="edit" />} />
          <Route path="/settings" element={<SettingsPage />} />
        </Route>
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </>,
  ),
);
