/**
 * CTABanner.tsx — Grand bandeau final de conversion (R11.4).
 */
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Sparkles, ArrowRight } from 'lucide-react';

export function CTABanner() {
  return (
    <section
      className="relative overflow-hidden bg-gradient-to-br from-neutral-900 via-primary-800 to-primary-700 text-white py-14 sm:py-20"
      aria-labelledby="cta-title"
    >
      <div
        aria-hidden
        className="absolute inset-0 opacity-40 pointer-events-none"
        style={{
          backgroundImage:
            'radial-gradient(circle at 20% 30%, rgba(234,179,8,0.25) 0%, transparent 45%), radial-gradient(circle at 80% 70%, rgba(255,255,255,0.15) 0%, transparent 45%)',
        }}
      />
      <div className="relative container mx-auto px-4 max-w-4xl text-center">
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.5 }}
        >
          <span className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-white/15 text-xs font-semibold uppercase tracking-wide">
            <Sparkles className="w-3.5 h-3.5" />
            Offre de bienvenue
          </span>
          <h2
            id="cta-title"
            className="mt-4 text-3xl sm:text-4xl lg:text-5xl font-extrabold leading-tight"
          >
            Prêt à commencer votre parcours ?
          </h2>
          <p className="mt-3 text-sm sm:text-base text-primary-100 max-w-xl mx-auto">
            Créez votre compte gratuit et débloquez immédiatement les cours
            gratuits + 10 % de réduction sur votre première formation payante.
          </p>
          <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
            <Link
              to="/register"
              className="inline-flex items-center gap-2 px-6 py-3 rounded-xl bg-accent-400 hover:bg-accent-500 text-primary-900 font-bold shadow-lift transition"
            >
              Créer un compte
              <ArrowRight className="w-4 h-4" />
            </Link>
            <Link
              to="/catalogue"
              className="inline-flex items-center gap-2 px-6 py-3 rounded-xl bg-white/10 hover:bg-white/20 backdrop-blur border border-white/20 font-bold transition"
            >
              Explorer les formations
            </Link>
          </div>
        </motion.div>
      </div>
    </section>
  );
}
