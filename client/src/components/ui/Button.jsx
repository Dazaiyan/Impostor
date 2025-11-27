import { motion } from "framer-motion";
import { cn } from "../../lib/utils";

export function Button({ className, variant = "primary", size = "md", children, ...props }) {
    const variants = {
        primary: "bg-gradient-to-br from-emerald-400 to-emerald-600 text-white shadow-lg shadow-emerald-500/20 hover:shadow-emerald-500/40 border border-emerald-400/20",
        secondary: "bg-gradient-to-br from-orange-400 to-orange-600 text-white shadow-lg shadow-orange-500/20 hover:shadow-orange-500/40 border border-orange-400/20",
        ghost: "bg-white/5 hover:bg-white/10 text-slate-200 border border-white/10",
        danger: "bg-gradient-to-br from-red-500 to-red-700 text-white shadow-lg shadow-red-500/20 hover:shadow-red-500/40 border border-red-500/20",
    };

    const sizes = {
        sm: "px-3 py-1.5 text-sm",
        md: "px-6 py-3 text-base",
        lg: "px-8 py-4 text-lg",
    };

    return (
        <motion.button
            whileHover={{ scale: 1.02, y: -1 }}
            whileTap={{ scale: 0.98 }}
            className={cn(
                "relative rounded-xl font-bold transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed",
                variants[variant],
                sizes[size],
                className
            )}
            {...props}
        >
            {children}
        </motion.button>
    );
}
