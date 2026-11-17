import { lazy, Suspense } from "react";
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
import AccountPage from "../features/account/AccountPage";
import LibraryPage from "../features/student/LibraryPage";
import ProfilePage from "../features/student/ProfilePage";
import AssignedPage from "../features/student/AssignedPage";
import NotificationsPage from "../features/student/NotificationsPage";
import PathPage from "../features/student/PathPage";
import PracticePage from "../features/exercises/PracticePage";
import AssignmentExercisePage from "../features/exercises/AssignmentExercisePage";
import ResultPage from "../features/exercises/ResultPage";
import TeacherOverviewPage from "../features/teacher/OverviewPage";
import ClassesPage from "../features/teacher/classes/ClassesPage";
import ClassDetailPage from "../features/teacher/classes/ClassDetailPage";
import TeacherNotificationsPage from "../features/teacher/NotificationsPage";
import AssignmentsPage from "../features/teacher/assignments/AssignmentsPage";
import AssignmentDetailPage from "../features/teacher/assignments/AssignmentDetailPage";
import NewAssignmentPage from "../features/teacher/assignments/NewAssignmentPage";
import ExercisesPage from "../features/teacher/exercises/ExercisesPage";
import GradingPage from "../features/teacher/grading/GradingPage";
import GradingDetailPage from "../features/teacher/grading/GradingDetailPage";
import AnalyticsPage from "../features/teacher/analytics/AnalyticsPage";
import { NewExercisePage } from "../features/teacher/placeholders";
import OverviewPage from "../features/admin/OverviewPage";
import { AiConfigPage, LibraryPage as AdminLibraryPage, LogsPage, ProposalsPage, ReportsPage, StatsPage, UsersPage } from "../features/admin/placeholders";

// Trang xem thử thành phần bài tập: chỉ đăng ký khi chạy `npm run dev`, bản build không có
const DevExercisesPage = import.meta.env.DEV ? lazy(() => import("../features/exercises/DevExercisesPage")) : null;

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
          { path: "assigned/:assignmentId", element: <AssignmentExercisePage /> },
          { path: "results/:attemptId", element: <ResultPage /> },
          { path: "library", element: <LibraryPage /> },
          { path: "library/:id", element: <PracticePage /> },
          { path: "profile", element: <ProfilePage /> },
          { path: "path", element: <PathPage /> },
          { path: "notifications", element: <NotificationsPage /> },
          { path: "account", element: <AccountPage /> },
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
          { path: "classes/:id", element: <ClassDetailPage /> },
          { path: "exercises", element: <ExercisesPage /> },
          { path: "exercises/new", element: <NewExercisePage /> },
          { path: "assignments", element: <AssignmentsPage /> },
          { path: "assignments/new", element: <NewAssignmentPage /> },
          { path: "assignments/:assignmentId", element: <AssignmentDetailPage /> },
          { path: "grading", element: <GradingPage /> },
          { path: "grading/:id", element: <GradingDetailPage /> },
          { path: "analytics", element: <AnalyticsPage /> },
          { path: "notifications", element: <TeacherNotificationsPage /> },
          { path: "account", element: <AccountPage /> },
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
          { path: "account", element: <AccountPage /> },
        ],
      },
    ],
  },
  ...(DevExercisesPage
    ? [
        {
          path: "/dev/exercises",
          element: (
            <Suspense fallback={null}>
              <DevExercisesPage />
            </Suspense>
          ),
        },
      ]
    : []),
  { path: "*", element: <Navigate to="/" replace /> },
]);
