/**
 * CartButton.tsx — Panier (R15.2).
 * Cart persist localStorage via useUIStore. Vrai checkout Stripe/Wave R16.
 */
import { Link } from 'react-router-dom';
import { ShoppingCart, Trash2, ArrowRight } from 'lucide-react';
import { Dropdown } from './Dropdown';
import { useCart, useUIStore } from '@/stores/ui';
import { formatPrice } from '@/lib/utils';

export function CartButton() {
  const cart = useCart();
  const removeFromCart = useUIStore((s) => s.removeFromCart);
  const clearCart = useUIStore((s) => s.clearCart);

  const total = cart.reduce((s, i) => s + (Number(i.price) || 0), 0);
  const currency = cart[0]?.currency || 'XOF';

  return (
    <Dropdown
      trigger={({ toggle }) => (
        <button
          type="button"
          onClick={toggle}
          className="relative p-2 rounded-lg hover:bg-neutral-100 transition"
          aria-label={`Panier (${cart.length} article${cart.length > 1 ? 's' : ''})`}
        >
          <ShoppingCart className="w-5 h-5 text-neutral-600" />
          {cart.length > 0 && (
            <span className="absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] px-1 rounded-full bg-accent-500 text-primary-900 text-[10px] font-bold flex items-center justify-center">
              {cart.length}
            </span>
          )}
        </button>
      )}
    >
      {({ close }) => (
        <>
          <div className="px-4 py-3 border-b border-neutral-100 flex items-center justify-between">
            <p className="text-sm font-bold">
              Panier ({cart.length} article{cart.length > 1 ? 's' : ''})
            </p>
            {cart.length > 0 && (
              <button
                onClick={clearCart}
                className="text-[11px] text-rose-500 hover:text-rose-700"
              >
                Vider
              </button>
            )}
          </div>

          {cart.length === 0 ? (
            <div className="px-4 py-10 text-center">
              <ShoppingCart className="w-8 h-8 mx-auto text-neutral-300" />
              <p className="mt-2 text-sm text-neutral-500">
                Votre panier est vide.
              </p>
              <Link
                to="/catalogue"
                onClick={close}
                className="mt-3 inline-block text-xs font-semibold text-primary-600 hover:text-primary-700"
              >
                Explorer le catalogue →
              </Link>
            </div>
          ) : (
            <>
              <ul className="max-h-64 overflow-y-auto divide-y divide-neutral-100">
                {cart.map((item) => (
                  <li
                    key={item.courseId}
                    className="px-4 py-3 flex items-center gap-2"
                  >
                    {item.thumbnail_url ? (
                      <img
                        src={item.thumbnail_url}
                        alt=""
                        className="w-12 h-8 rounded object-cover shrink-0"
                      />
                    ) : (
                      <div className="w-12 h-8 rounded bg-primary-100 shrink-0" />
                    )}
                    <div className="flex-1 min-w-0">
                      <Link
                        to={`/courses/${item.slug}`}
                        onClick={close}
                        className="text-xs font-semibold truncate block hover:text-primary-600"
                      >
                        {item.title}
                      </Link>
                      <p className="text-[11px] text-neutral-500">
                        {formatPrice(item.price, item.currency)}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => removeFromCart(item.courseId)}
                      aria-label="Retirer"
                      className="p-1 rounded hover:bg-rose-50 text-rose-500"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </li>
                ))}
              </ul>
              <div className="px-4 py-3 border-t border-neutral-100 flex items-center justify-between text-sm">
                <p className="font-bold">Total</p>
                <p className="font-extrabold text-primary-700">
                  {formatPrice(total, currency)}
                </p>
              </div>
              <div className="border-t border-neutral-100 p-2">
                <button
                  type="button"
                  onClick={close}
                  disabled
                  className="w-full inline-flex items-center justify-center gap-2 px-3 py-2 rounded-lg text-xs font-bold bg-neutral-200 text-neutral-500 cursor-not-allowed"
                >
                  Passer commande (R16)
                  <ArrowRight className="w-3.5 h-3.5" />
                </button>
              </div>
            </>
          )}
        </>
      )}
    </Dropdown>
  );
}
