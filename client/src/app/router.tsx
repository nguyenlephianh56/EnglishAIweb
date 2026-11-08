import { createBrowserRouter, Navigate } from "react-router-dom";
import { PublicOnlyRoute, RequireRole } from "./guards";
import LandingPage from "../features/landing/LandingPage";
import LoginPage from "../features/auth/LoginPage";
import RegisterPage from "../features/auth/RegisterPage";
import PendingPage from "../features/auth/PendingPage";
import StudentPage from "../features/student/StudentPage";
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
  { element: <RequireRole role="STUDENT" />, children: [{ path: "/student", element: <StudentPage /> }] },
  { element: <RequireRole role="TEACHER" />, children: [{ path: "/teacher", element: <TeacherPage /> }] },
  { element: <RequireRole role="ADMIN" />, children: [{ path: "/admin", element: <AdminPage /> }] },
  { path: "*", element: <Navigate to="/" replace /> },
]);
