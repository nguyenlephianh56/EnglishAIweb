import { createBrowserRouter, Navigate } from "react-router-dom";
import { PublicOnlyRoute, RequireRole } from "./guards";
import StudentLayout from "../components/layout/StudentLayout";
import LandingPage from "../features/landing/LandingPage";
import LoginPage from "../features/auth/LoginPage";
import RegisterPage from "../features/auth/RegisterPage";
import PendingPage from "../features/auth/PendingPage";
import HomePage from "../features/student/HomePage";
import { AssignedPage, LibraryPage, NotificationsPage, PathPage, ProfilePage } from "../features/student/placeholders";
import TeacherPage from "../features/teacher/TeacherPage";
import AdminPage from "../features/admin/AdminPage";

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
  { element: <RequireRole role="TEACHER" />, children: [{ path: "/teacher", element: <TeacherPage /> }] },
  { element: <RequireRole role="ADMIN" />, children: [{ path: "/admin", element: <AdminPage /> }] },
  { path: "*", element: <Navigate to="/" replace /> },
]);
