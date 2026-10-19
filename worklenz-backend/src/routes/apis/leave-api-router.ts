import express from "express";

import LeaveController from "../../controllers/leave-controller";
import idParamValidator from "../../middlewares/validators/id-param-validator";
import teamOwnerOrAdminValidator from "../../middlewares/validators/team-owner-or-admin-validator";
import safeControllerFunction from "../../shared/safe-controller-function";

const leaveApiRouter = express.Router();

// Current member
leaveApiRouter.get("/me", safeControllerFunction(LeaveController.getMyOverview));
leaveApiRouter.post("/requests", safeControllerFunction(LeaveController.createRequest));
leaveApiRouter.post("/requests/:id/cancel", idParamValidator, safeControllerFunction(LeaveController.cancelRequest));
leaveApiRouter.get("/holidays", safeControllerFunction(LeaveController.getHolidays));
leaveApiRouter.get("/work-locations/today", safeControllerFunction(LeaveController.getTodayLocation));
leaveApiRouter.get("/work-locations", safeControllerFunction(LeaveController.getMyLocations));
leaveApiRouter.put("/work-locations", safeControllerFunction(LeaveController.setLocation));

// Leadership (Owner / Admin)
leaveApiRouter.get("/attendance", teamOwnerOrAdminValidator, safeControllerFunction(LeaveController.getAttendance));
leaveApiRouter.get(
  "/attendance/report.pdf",
  teamOwnerOrAdminValidator,
  safeControllerFunction(LeaveController.exportAttendancePdf)
);
leaveApiRouter.get("/balances", teamOwnerOrAdminValidator, safeControllerFunction(LeaveController.getBalances));
leaveApiRouter.put("/balances/:teamMemberId", teamOwnerOrAdminValidator, safeControllerFunction(LeaveController.setBaseAllowance));
leaveApiRouter.get(
  "/balances/:teamMemberId/adjustments",
  teamOwnerOrAdminValidator,
  safeControllerFunction(LeaveController.getAdjustments)
);
leaveApiRouter.post(
  "/balances/:teamMemberId/adjustments",
  teamOwnerOrAdminValidator,
  safeControllerFunction(LeaveController.addAdjustment)
);
leaveApiRouter.put(
  "/balances/:teamMemberId/adjustments/:adjustmentId",
  teamOwnerOrAdminValidator,
  safeControllerFunction(LeaveController.updateAdjustment)
);
leaveApiRouter.delete(
  "/balances/:teamMemberId/adjustments/:adjustmentId",
  teamOwnerOrAdminValidator,
  safeControllerFunction(LeaveController.deleteAdjustment)
);
leaveApiRouter.get("/requests", teamOwnerOrAdminValidator, safeControllerFunction(LeaveController.getRequests));
leaveApiRouter.post(
  "/requests/:id/review",
  teamOwnerOrAdminValidator,
  idParamValidator,
  safeControllerFunction(LeaveController.reviewRequest)
);

leaveApiRouter.delete(
  "/requests/:id",
  teamOwnerOrAdminValidator,
  idParamValidator,
  safeControllerFunction(LeaveController.deleteRequest)
);

export default leaveApiRouter;
