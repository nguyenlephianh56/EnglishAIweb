import { api, unwrap } from "./client";
import type { AuthUser } from "../types/auth";

export const fetchMe = () => unwrap<AuthUser>(api.get("/auth/me"));
