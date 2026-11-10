import { createBrowserRouter, Navigate } from "react-router-dom";
import { PublicOnlyRoute, RequireRole } from "./guards";
import StudentLayout from "../components/layout/StudentLayout";
import AdminLayout from "../components/layout/AdminLayout";
import TeacherLayout from "../components/layout/TeacherLayout";
import LandingPage from "../features/landing/LandingPage";
import LoginPage from "../features/auth/LoginPage";
import RegisterPage from "../features/auth/RegisterPage";
import PendingPage from "../features/auth/PendingPage";
import HomePage from "../features/student/HomePage";
import { AssignedPage, LibraryPage, NotificationsPage, PathPage, ProfilePage } from "../features/student/placeholders";
import TeacherOverviewPage from "../features/teacher/OverviewPage";
import { AnalyticsPage, AssignmentsPage, ClassesPage, ExercisesPage, GradingPage, NewExercisePage, NotificationsPage as TeacherNotificationsPage } from "../features/teacher/placeholders";
import OverviewPage from "../features/admin/OverviewPage";
import { AiConfigPage, LibraryPage as AdminLibraryPage, LogsPage, ProposalsPage, ReportsPage, StatsPage, UsersPage } from "../features/admin/placeholders";

export const router = createBrowserRouter([
  {
    element: <PublicOnlyRoute />,
    children: [
      { path: "/", element: <LandingPage /> },
      { path: "/login", element: <LoginPage /> },
      { path: "/register", element: <RegisterPage /> },
    ],
  },
  { path: "/pending", element: <PendingPage /> },
  {
    element: <RequireRole role="STUDENT" />,
    children: [
      {
        path: "/student",
        element: <StudentLayout />,
        children: [
          { index: true, element: <HomePage /> },
          { path: "assigned", element: <AssignedPage /> },
          { path: "library", element: <LibraryPage /> },
          { path: "profile", element: <ProfilePage /> },
          { path: "path", element: <PathPage /> },
          { path: "notifications", element: <NotificationsPage /> },
        ],
      },
    ],
  },
  {
    element: <RequireRole role="TEACHER" />,
    children: [
      {
        path: "/teacher",
        element: <TeacherLayout />,
        children: [
          { index: true, element: <TeacherOverviewPage /> },
          { path: "classes", element: <ClassesPage /> },
          { path: "exercises", element: <ExercisesPage /> },
          { path: "exercises/new", element: <NewExercisePage /> },
          { path: "assignments", element: <AssignmentsPage /> },
          { path: "grading", element: <GradingPage /> },
          { path: "analytics", element: <AnalyticsPage /> },
          { path: "notifications", element: <TeacherNotificationsPage /> },
        ],
      },
    ],
  },
  {
    element: <RequireRole role="ADMIN" />,
    children: [
      {
        path: "/admin",
        element: <AdminLayout />,
        children: [
          { index: true, element: <OverviewPage /> },
          { path: "users", element: <UsersPage /> },
          { path: "library", element: <AdminLibraryPage /> },
          { path: "proposals", element: <ProposalsPage /> },
          { path: "reports", element: <ReportsPage /> },
          { path: "ai-config", element: <AiConfigPage /> },
          { path: "stats", element: <StatsPage /> },
          { path: "logs", element: <LogsPage /> },
        ],
      },
    ],
  },
  { path: "*", element: <Navigate to="/" replace /> },
]);
