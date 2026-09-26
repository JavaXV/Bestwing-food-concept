const express = require("express");
const router = express.Router();

const pool = require("../config/db");
const { authenticate, requireAdmin } = require("../middleware/auth");

/*
|--------------------------------------------------------------------------
| ADMIN: GET ALL TICKETS
|--------------------------------------------------------------------------
| GET /api/complaints
|
| Requires:
| authenticate + requireAdmin
|--------------------------------------------------------------------------
*/
router.get(
    "/",
    authenticate,
    requireAdmin,
    async (req, res) => {
        try {
            const [rows] = await pool.query(
                `
                SELECT
                    c.id,
                    c.user_id,
                    c.ticket_number,
                    c.category,
                    c.subject,
                    c.accountno,
                    c.reference,
                    c.description,
					c.message,
                    c.priority,
                    c.status,
                    c.created_at,
                    c.updated_at,

                    u.full_name,
                    u.email,
                    u.phone_number

                FROM complaints c

                LEFT JOIN users u
                    ON u.id = c.user_id

                ORDER BY c.created_at DESC
                `
            );

            return res.json({
                success: true,
                count: rows.length,
                tickets: rows
            });

        } catch (error) {
            console.error(
                "GET /api/complaints error:",
                error
            );

            return res.status(500).json({
                success: false,
                message: "Failed to load support tickets."
            });
        }
    }
);


/*
|--------------------------------------------------------------------------
| ADMIN: GET ONE TICKET
|--------------------------------------------------------------------------
| GET /api/complaints/:id
|--------------------------------------------------------------------------
*/
router.get(
    "/:id",
    authenticate,
    requireAdmin,
    async (req, res) => {
        try {
            const ticketId = Number(req.params.id);

            if (!Number.isInteger(ticketId) || ticketId <= 0) {
                return res.status(400).json({
                    success: false,
                    message: "Invalid ticket ID."
                });
            }

            const [rows] = await pool.query(
                `
                SELECT
                    c.id,
                    c.user_id,
                    c.ticket_number,
                    c.category,
                    c.subject,
                    c.accountno,
                    c.reference,
                    c.description,
					c.message,
                    c.priority,
                    c.status,
                    c.created_at,
                    c.updated_at,

                    u.full_name,
                    u.email,
                    u.phone_number

                FROM complaints c

                LEFT JOIN users u
                    ON u.id = c.user_id

                WHERE c.id = ?

                LIMIT 1
                `,
                [ticketId]
            );

            if (rows.length === 0) {
                return res.status(404).json({
                    success: false,
                    message: "Ticket not found."
                });
            }

            return res.json({
                success: true,
                ticket: rows[0]
            });

        } catch (error) {
            console.error(
                "GET /api/complaints/:id error:",
                error
            );

            return res.status(500).json({
                success: false,
                message: "Failed to load ticket."
            });
        }
    }
);


/*
|--------------------------------------------------------------------------
| ADMIN: DELETE TICKET
|--------------------------------------------------------------------------
| DELETE /api/complaints/:id
|--------------------------------------------------------------------------
*/
router.delete(
    "/:id",
    authenticate,
    requireAdmin,
    async (req, res) => {
        try {
            const ticketId = Number(req.params.id);

            if (!Number.isInteger(ticketId) || ticketId <= 0) {
                return res.status(400).json({
                    success: false,
                    message: "Invalid ticket ID."
                });
            }

            const [result] = await pool.query(
                `
                DELETE FROM complaints
                WHERE id = ?
                `,
                [ticketId]
            );

            if (result.affectedRows === 0) {
                return res.status(404).json({
                    success: false,
                    message: "Ticket not found."
                });
            }

            return res.json({
                success: true,
                message: "Ticket deleted successfully."
            });

        } catch (error) {
            console.error(
                "DELETE /api/complaints/:id error:",
                error
            );

            return res.status(500).json({
                success: false,
                message: "Failed to delete ticket."
            });
        }
    }
);

module.exports = router;