/**
 * UserMenu.tsx — Avatar + menu déroulant utilisateur (R15.2).
 */
import { Link, useNavigate } from 'react-router-dom';
import {
  LayoutDashboard,
  User,
  BookOpen,
  Award,
  Wallet,
  Settings,
  LogOut,
  ChevronDown,
  Shield,
  GraduationCap,
} from 'lucide-react';
import { Dropdown } from './Dropdown';
import { useAuthStore, useAuthUser } from '@/stores/auth';

export function UserMenu() {
  const user = useAuthUser();
  const logout = useAuthStore((s) => s.logout);
  const navigate = useNavigate();

  if (!user) return null;

  const handleLogout = async () => {
    await logout();
    navigate('/login');
  };

  const isInstructor = user.roles?.includes('instructor');
  const isAdmin = user.is_platform_admin;

  return (
    <Dropdown
      trigger={({ toggle, open }) => (
        <button
          type="button"
          onClick={toggle}
          aria-haspopup="menu"
          aria-expanded={open}
          className="flex items-center gap-2 px-1.5 py-1 rounded-full hover:bg-neutral-100 transition"
        >
          {user.avatar_url ? (
            <img
              src={user.avatar_url}
              alt=""
              className="w-8 h-8 rounded-full object-cover"
            />
          ) : (
            <div className="w-8 h-8 rounded-full bg-gradient-to-br from-primary-500 to-primary-700 text-white flex items-center justify-center font-bold text-xs">
              {(user.full_name || user.email).charAt(0).toUpperCase()}
            </div>
          )}
          <ChevronDown
            className="hidden sm:inline w-3 h-3 text-neutral-400"
            aria-hidden
          />
        </button>
      )}
    >
      {({ close }) => (
        <>
          <div className="px-4 py-3 border-b border-neutral-100">
            <p className="text-sm font-bold truncate">
              {user.full_name || user.email.split('@')[0]}
            </p>
            <p className="text-[11px] text-neutral-500 truncate">{user.email}</p>
          </div>
          <ul className="py-1">
            <MenuLink
              to="/learn"
              onClick={close}
              Icon={LayoutDashboard}
              label="Mon tableau de bord"
            />
            <MenuLink
              to="/learn/profile"
              onClick={close}
              Icon={User}
              label="Mon profil"
            />
            <MenuLink
              to="/learn/courses"
              onClick={close}
              Icon={BookOpen}
              label="Mes cours"
            />
            <MenuLink
              to="/learn/certificates"
              onClick={close}
              Icon={Award}
              label="Mes certificats"
            />
            <MenuLink
              to="/learn/payments"
              onClick={close}
              Icon={Wallet}
              label="Mes paiements"
              badge="R16"
            />
            <MenuLink
              to="/learn/profile"
              onClick={close}
              Icon={Settings}
              label="Paramètres"
            />
          </ul>

          {(isInstructor || isAdmin) && (
            <>
              <div className="border-t border-neutral-100" />
              <p className="px-4 pt-2 pb-1 text-[10px] font-bold uppercase tracking-widest text-neutral-400">
                Espaces
              </p>
              <ul className="py-1">
                {isInstructor && (
                  <MenuLink
                    to="/instructor"
                    onClick={close}
                    Icon={GraduationCap}
                    label="Studio instructeur"
                  />
                )}
                {isAdmin && (
                  <MenuLink
                    to="/dashboard/admin"
                    onClick={close}
                    Icon={Shield}
                    label="Admin plateforme"
                  />
                )}
              </ul>
            </>
          )}

          <div className="border-t border-neutral-100" />
          <button
            type="button"
            onClick={handleLogout}
            className="w-full flex items-center gap-2.5 px-4 py-2.5 text-sm text-neutral-700 hover:bg-neutral-50 hover:text-rose-600 transition"
          >
            <LogOut className="w-4 h-4" />
            Déconnexion
          </button>
        </>
      )}
    </Dropdown>
  );
}

function MenuLink({
  to,
  onClick,
  Icon,
  label,
  badge,
}: {
  to: string;
  onClick?: () => void;
  Icon: typeof LayoutDashboard;
  label: string;
  badge?: string;
}) {
  return (
    <li>
      <Link
        to={to}
        onClick={onClick}
        className="flex items-center gap-2.5 px-4 py-2 text-sm text-neutral-700 hover:bg-neutral-50 transition"
        role="menuitem"
      >
        <Icon className="w-4 h-4 text-neutral-400" />
        <span className="flex-1">{label}</span>
        {badge && (
          <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-neutral-100 text-neutral-500 uppercase">
            {badge}
          </span>
        )}
      </Link>
    </li>
  );
}
