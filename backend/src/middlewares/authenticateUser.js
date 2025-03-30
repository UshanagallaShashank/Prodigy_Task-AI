const { supabase } = require("../utils/supabase");

exports.authenticateUser = async (req, res, next) => {
    try {
        const token = req.headers.authorization?.split(" ")[1];

        if (!token) {
            return res.status(401).json({ error: "Unauthorized: No token provided" });
        }

        // Verify user token with Supabase
        const { data: { user }, error } = await supabase.auth.getUser(token);

        if (error || !user) {
            return res.status(401).json({ error: "Unauthorized: Invalid token" });
        }

        req.user = user; // Attach user details to request
        next();
    } catch (err) {
        console.error("Auth Middleware Error:", err);
        res.status(500).json({ error: "Internal Server Error" });
    }
};
