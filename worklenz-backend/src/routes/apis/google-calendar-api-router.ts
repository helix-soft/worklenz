import express from "express";

import GoogleCalendarController from "../../controllers/google-calendar-controller";
import safeControllerFunction from "../../shared/safe-controller-function";

// Read-only Google Calendar integration of the current user.
const googleCalendarApiRouter = express.Router();

googleCalendarApiRouter.get("/status", safeControllerFunction(GoogleCalendarController.getStatus));
googleCalendarApiRouter.get("/auth-url", safeControllerFunction(GoogleCalendarController.getAuthUrl));
googleCalendarApiRouter.post("/sync", safeControllerFunction(GoogleCalendarController.sync));
googleCalendarApiRouter.delete("/connection", safeControllerFunction(GoogleCalendarController.disconnect));
googleCalendarApiRouter.get("/events", safeControllerFunction(GoogleCalendarController.getEvents));

export default googleCalendarApiRouter;
