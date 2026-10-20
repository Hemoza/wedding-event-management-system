import { useEffect, useMemo, useState } from "react";
import {
  ArrowDownRight,
  ArrowRight,
  CalendarDays,
  Check,
  ChevronDown,
  ClipboardList,
  Clock3,
  Heart,
  LayoutDashboard,
  LogOut,
  MapPin,
  Menu,
  Plus,
  Search,
  Settings2,
  Sparkles,
  Star,
  Users,
  Wallet,
  X,
} from "lucide-react";

type User = {
  id: number;
  name: string;
  email: string;
  role: "customer" | "admin";
};
type Event = {
  id: number;
  name: string;
  couple: string;
  date: string;
  location: string;
  guests: number;
  budget: number;
  notes: string;
  status: string;
};
const api = async (path: string, options: RequestInit = {}) => {
  const isForm = options.body instanceof FormData;
  const requestHeaders = isForm
    ? { ...(options.headers as Record<string, string> | undefined) }
    : {
        "Content-Type": "application/json",
        ...(options.headers as Record<string, string> | undefined),
      };
  const res = await fetch(`/api${path}`, {
    credentials: "include",
    headers: requestHeaders,
    ...options,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || "Request failed.");
  return data;
};
const inr = (n: number) =>
  new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(n || 0);
const dateText = (d: string) =>
  d
    ? new Date(`${d}T00:00:00`).toLocaleDateString("en-IN", {
        day: "numeric",
        month: "short",
        year: "numeric",
      })
    : "Date to be decided";
type Catalog = { venues: any[]; vendors: any[] };
type BookingIntent = {
  resourceType: "venue" | "package";
  resourceId: number;
  title: string;
  price: number;
};
export default function App() {
  const [user, setUser] = useState<User | null>(null),
    [page, setPage] = useState("overview"),
    [events, setEvents] = useState<Event[]>([]),
    [catalog, setCatalog] = useState<Catalog>({ venues: [], vendors: [] }),
    [bookings, setBookings] = useState<any[]>([]),
    [selected, setSelected] = useState<number | null>(null),
    [bookingIntent, setBookingIntent] = useState<BookingIntent | null>(null),
    [modal, setModal] = useState(""),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [query, setQuery] = useState(""),
    [mobile, setMobile] = useState(false);
  const active = events.find((e) => e.id === selected) || events[0];
  const refresh = async () => {
    const [ev, cat] = await Promise.all([api("/events"), api("/catalog")]);
    setEvents(ev);
    setCatalog(cat);
    if (ev.length && !selected) setSelected(ev[0].id);
    if (user) {
      setBookings(await api("/bookings"));
    }
  };
  useEffect(() => {
    api("/auth/me")
      .then((u: User | null) => {
        setUser(u);
        if (u) {
          api("/events").then((ev: Event[]) => {
            setEvents(ev);
            setSelected(ev[0]?.id || null);
          });
          api("/catalog").then(setCatalog);
          api("/bookings").then(setBookings);
        }
      })
      .catch(() => {});
  }, []);
  const message = (text: string) => {
    setNotice(text);
    setTimeout(() => setNotice(""), 3200);
  };
  const run = async (fn: () => Promise<any>, success?: string) => {
    setBusy(true);
    setError("");
    try {
      await fn();
      if (success) message(success);
      await refresh();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  const auth = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    setBusy(true);
    setError("");
    try {
      const u = await api(
        `/auth/${modal === "register" ? "register" : "login"}`,
        { method: "POST", body: JSON.stringify(Object.fromEntries(f)) },
      );
      setUser(u);
      const ev = await api("/events");
      setEvents(ev);
      setSelected(ev[0]?.id || null);
      setBookings(await api("/bookings"));
      setCatalog(await api("/catalog"));
      setModal(bookingIntent ? (ev.length ? "booking" : "event") : "");
      message(`Welcome, ${u.name.split(" ")[0]}.`);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  const logout = () =>
    run(async () => {
      await api("/auth/logout", { method: "POST" });
      setUser(null);
      setPage("overview");
      setEvents([]);
      setBookings([]);
    }, "You have signed out.");
  const nav = [
    ["overview", "Overview", LayoutDashboard],
    ["events", "My wedding", Heart],
    ["schedule", "Schedule", CalendarDays],
    ["guests", "Guests", Users],
    ["venues", "Venues", MapPin],
    ["services", "Services", Sparkles],
    ["bookings", "Bookings", ClipboardList],
    ["budget", "Budget", Wallet],
  ] as const;
  const shownVenues = useMemo(
    () =>
      catalog.venues.filter((v: any) =>
        `${v.name} ${v.location} ${v.type}`
          .toLowerCase()
          .includes(query.toLowerCase()),
      ),
    [catalog.venues, query],
  );
  const shownVendors = useMemo(
    () =>
      catalog.vendors.filter((v: any) =>
        `${v.name} ${v.location} ${v.category}`
          .toLowerCase()
          .includes(query.toLowerCase()),
      ),
    [catalog.vendors, query],
  );
  const openBook = (
    resourceType: string,
    resourceId: number,
    title: string,
    price: number,
  ) => {
    setBookingIntent({
      resourceType: resourceType as BookingIntent["resourceType"],
      resourceId,
      title,
      price,
    });
    if (!user) {
      setModal("login");
      setError("");
      return;
    }
    if (!events.length) {
      setPage("events");
      setModal("event");
      return;
    }
    setModal("booking");
  };
  const submitEvent = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const values = Object.fromEntries(new FormData(e.currentTarget));
    await run(async () => {
      const saved = await api(
        modal === "edit-event" ? `/events/${selected}` : "/events",
        {
          method: modal === "edit-event" ? "PUT" : "POST",
          body: JSON.stringify(values),
        },
      );
      if (modal !== "edit-event") setSelected(saved.id);
      setModal(modal !== "edit-event" && bookingIntent ? "booking" : "");
    }, "Wedding details saved.");
  };
  const submitProfile = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const values = Object.fromEntries(new FormData(e.currentTarget));
    setBusy(true);
    setError("");
    try {
      const updated = await api("/profile", {
        method: "PATCH",
        body: JSON.stringify(values),
      });
      setUser(updated);
      setModal("");
      message("Your profile is updated.");
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };
  const submitBooking = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const values = Object.fromEntries(new FormData(e.currentTarget));
    if (!bookingIntent) {
      setError(
        "Please choose a venue or service again before sending a request.",
      );
      setModal("");
      return;
    }
    await run(async () => {
      await api("/bookings", {
        method: "POST",
        body: JSON.stringify({
          ...values,
          eventId: Number(values.eventId),
          resourceType: bookingIntent.resourceType,
          resourceId: bookingIntent.resourceId,
        }),
      });
      setModal("");
      setBookingIntent(null);
    }, "Request sent. It remains pending until the team reviews it.");
  };
  if (!user)
    return (
      <>
        <header className="site-nav">
          <a className="brand" href="#top">
            <span className="brand-mark">
              <Heart size={17} />
            </span>{" "}
            everafter<span className="brand-dot">.</span>
          </a>
          <nav>
            <a href="#venues">Venues</a>
            <a href="#services">Services</a>
            <a href="#how">How it works</a>
          </nav>
          <div className="nav-actions">
            <button
              className="text-button"
              onClick={() => {
                setModal("login");
                setError("");
              }}
            >
              Log in
            </button>
            <button
              className="button button-dark"
              onClick={() => {
                setModal("register");
                setError("");
              }}
            >
              Start planning <ArrowRight size={15} />
            </button>
          </div>
          <button className="mobile-menu" onClick={() => setMobile(!mobile)}>
            <Menu />
          </button>
          {mobile && (
            <div className="mobile-pop">
              <a href="#venues">Venues</a>
              <a href="#services">Services</a>
              <button onClick={() => setModal("login")}>Log in</button>
              <button onClick={() => setModal("register")}>
                Start planning
              </button>
            </div>
          )}
        </header>
        <main id="top">
          <section className="hero">
            <div className="hero-copy">
              <div className="eyebrow">
                <span></span> A calmer way to plan
              </div>
              <h1>
                Make room for
                <br />
                the <em>moments</em> that matter.
              </h1>
              <p>
                All the thoughtful details of your celebration, gathered in one
                beautiful place.
              </p>
              <button
                className="button button-dark button-large"
                onClick={() => setModal("register")}
              >
                Begin your story <ArrowRight size={16} />
              </button>
              <div className="hero-note">
                <div className="avatar-stack">
                  <i>A</i>
                  <i>M</i>
                  <i>R</i>
                </div>
                <span>Made for your kind of celebration</span>
              </div>
            </div>
            <div className="hero-image">
              <div className="image-caption">
                <span>01 / A day to remember</span>
                <ArrowDownRight size={16} />
              </div>
            </div>
            <div className="hero-index">
              EST. FOR THE
              <br />
              IN-BETWEEN
            </div>
          </section>
          <section className="intro section-wrap" id="how">
            <div className="eyebrow">A little more presence</div>
            <div className="intro-grid">
              <h2>
                Your wedding,
                <br />
                <em>beautifully considered.</em>
              </h2>
              <div>
                <p className="lead">
                  A celebration is made of a thousand small decisions. We bring
                  your plans, people and possibilities together, so you can
                  enjoy making them.
                </p>
                <button
                  className="link-button"
                  onClick={() => setModal("register")}
                >
                  Find your starting point <ArrowRight size={15} />
                </button>
              </div>
            </div>
          </section>
          <section className="browse-section" id="venues">
            <div className="section-wrap">
              <div className="section-heading">
                <div>
                  <div className="eyebrow">Places with a sense of occasion</div>
                  <h2>
                    Find your <em>somewhere.</em>
                  </h2>
                </div>
                <button
                  className="link-button"
                  onClick={() => {
                    setModal("register");
                  }}
                >
                  Explore all venues <ArrowRight size={15} />
                </button>
              </div>
              <div className="public-grid">
                {catalog.venues.slice(0, 3).map((v: any, i) => (
                  <article
                    className={`public-card ${i === 1 ? "offset" : ""}`}
                    key={v.id}
                  >
                    <div
                      className={`catalog-image venue-image image-${i + 1}`}
                      style={{ backgroundImage: `url('${v.image}')` }}
                    >
                      <span>{v.type}</span>
                    </div>
                    <div className="public-card-info">
                      <div>
                        <h3>{v.name}</h3>
                        <p>
                          <MapPin size={13} />
                          {v.location}
                        </p>
                      </div>
                      <b>from {inr(v.price)}</b>
                    </div>
                  </article>
                ))}
              </div>
            </div>
          </section>
          <section className="services-band" id="services">
            <div className="section-wrap services-layout">
              <div>
                <div className="eyebrow">Considered company</div>
                <h2>
                  The right people
                  <br />
                  make it <em>feel like you.</em>
                </h2>
                <p>
                  Meet the small teams and thoughtful makers who know how to
                  bring a day to life.
                </p>
                <button
                  className="button button-outline"
                  onClick={() => setModal("register")}
                >
                  Meet the makers <ArrowRight size={15} />
                </button>
              </div>
              <div className="service-list">
                {catalog.vendors.slice(0, 4).map((v: any, i) => (
                  <div className="service-row" key={v.id}>
                    <span>0{i + 1}</span>
                    <div>
                      <h3>{v.category}</h3>
                      <p>
                        {v.name} · {v.location}
                      </p>
                    </div>
                    <ArrowRight size={15} />
                  </div>
                ))}
              </div>
            </div>
          </section>
          <section className="how-section section-wrap">
            <div className="eyebrow">A gentler way to get there</div>
            <h2>
              From first thought to <em>forever.</em>
            </h2>
            <div className="how-grid">
              {[
                [
                  "01",
                  "Gather your thoughts",
                  "Start with your date, your people and the feeling you want to remember.",
                ],
                [
                  "02",
                  "Find your people",
                  "Explore venues and trusted makers, then send a request when something feels right.",
                ],
                [
                  "03",
                  "Enjoy the day",
                  "Keep your plans, schedule and guest list close as the celebration comes together.",
                ],
              ].map((x) => (
                <article key={x[0]}>
                  <span>{x[0]}</span>
                  <h3>{x[1]}</h3>
                  <p>{x[2]}</p>
                </article>
              ))}
            </div>
          </section>
          <section className="quote-section">
            <div className="quote-mark">“</div>
            <blockquote>
              It helped us feel present through all the planning. We knew where
              everything was, and somehow there was more room for the fun parts.
            </blockquote>
            <div className="quote-byline">— DEMO STORY · PRIYA & ARJUN</div>
            <div className="quote-image"></div>
          </section>
        </main>
        <footer className="site-footer">
          <a className="brand" href="#top">
            <span className="brand-mark">
              <Heart size={17} />
            </span>{" "}
            everafter<span className="brand-dot">.</span>
          </a>
          <p>For the days that become your stories.</p>
          <div>
            <a href="#venues">Venues</a>
            <a href="#services">Services</a>
            <a href="#how">Our approach</a>
            <a href="mailto:hello@everafter.local">Say hello</a>
          </div>
          <small>© 2026 Everafter · Demo planning platform</small>
        </footer>
        {modal && (
          <Modal
            title={
              modal === "login"
                ? "Welcome back"
                : modal === "register"
                  ? "Let’s begin"
                  : "Request a booking"
            }
            onClose={() => {
              setModal("");
              setError("");
              setBookingIntent(null);
            }}
            error={error}
          >
            <form
              onSubmit={
                modal === "login" || modal === "register" ? auth : submitBooking
              }
              className="form-stack"
            >
              {modal === "register" && (
                <Field label="Your name" name="name" required />
              )}
              {(modal === "login" || modal === "register") && (
                <>
                  <Field
                    label="Email address"
                    name="email"
                    type="email"
                    required
                  />
                  <Field
                    label="Password"
                    name="password"
                    type="password"
                    required
                    minLength={8}
                  />
                  <button className="button button-dark full" disabled={busy}>
                    {busy
                      ? "Please wait…"
                      : modal === "login"
                        ? "Log in"
                        : "Create your planning space"}
                  </button>
                  <p className="switch-auth">
                    {modal === "login"
                      ? "New to Everafter?"
                      : "Already have an account?"}{" "}
                    <button
                      type="button"
                      onClick={() =>
                        setModal(modal === "login" ? "register" : "login")
                      }
                    >
                      {modal === "login" ? "Create an account" : "Log in"}
                    </button>
                  </p>
                  {modal === "login" && (
                    <p className="auth-admin-note">
                      Administrators use this same sign-in with the credentials
                      configured in the project’s .env file.
                    </p>
                  )}
                </>
              )}
              {modal === "booking" && (
                <>
                  <p className="modal-sub">
                    {bookingIntent?.title} · {inr(bookingIntent?.price || 0)}
                  </p>
                  <label>
                    Wedding event
                    <select
                      name="eventId"
                      value={selected || ""}
                      onChange={(e) => setSelected(Number(e.target.value))}
                    >
                      {events.map((ev) => (
                        <option value={ev.id} key={ev.id}>
                          {ev.name}
                        </option>
                      ))}
                    </select>
                  </label>
                  <Field
                    label="Requested date"
                    name="date"
                    type="date"
                    required
                  />
                  <label>
                    Anything we should know?
                    <textarea name="details" rows={3} />
                  </label>
                  <button className="button button-dark full" disabled={busy}>
                    {busy ? "Sending…" : "Send booking request"}
                  </button>
                </>
              )}
            </form>
          </Modal>
        )}
      </>
    );
  const title = nav.find((x) => x[0] === page)?.[1] || page;
  return (
    <div className="app-shell">
      <aside className={`sidebar ${mobile ? "open" : ""}`}>
        <a
          className="brand app-brand"
          href="#"
          onClick={(e) => {
            e.preventDefault();
            setPage("overview");
          }}
        >
          <span className="brand-mark">
            <Heart size={17} />
          </span>{" "}
          everafter<span className="brand-dot">.</span>
        </a>
        <div className="workspace-label">YOUR CELEBRATION</div>
        {active && (
          <button className="event-switcher" onClick={() => setPage("events")}>
            <span className="event-avatar">
              {active.couple
                .split("&")
                .map((s) => s.trim()[0])
                .join("")}
            </span>
            <span>
              <b>{active.couple}</b>
              <small>{dateText(active.date)}</small>
            </span>
            <ChevronDown size={15} />
          </button>
        )}
        <div className="side-label">PLAN</div>
        <nav className="side-nav">
          {nav.slice(0, 4).map(([id, label, Icon]) => (
            <button
              key={id}
              className={page === id ? "selected" : ""}
              onClick={() => {
                setPage(id);
                setMobile(false);
              }}
            >
              <Icon size={17} />
              {label}
              {id === "bookings" &&
                bookings.some((b) => b.status === "Pending") && (
                  <i className="nav-dot" />
                )}
            </button>
          ))}
        </nav>
        <div className="side-label discover-label">DISCOVER</div>
        <nav className="side-nav">
          {nav.slice(4, 6).map(([id, label, Icon]) => (
            <button
              key={id}
              className={page === id ? "selected" : ""}
              onClick={() => {
                setPage(id);
                setMobile(false);
              }}
            >
              <Icon size={17} />
              {label}
            </button>
          ))}
        </nav>
        <div className="side-label">MANAGE</div>
        <nav className="side-nav">
          {nav.slice(6).map(([id, label, Icon]) => (
            <button
              key={id}
              className={page === id ? "selected" : ""}
              onClick={() => {
                setPage(id);
                setMobile(false);
              }}
            >
              <Icon size={17} />
              {label}
            </button>
          ))}
        </nav>
        {user.role === "admin" && (
          <>
            <div className="side-label">ADMINISTRATION</div>
            <nav className="side-nav">
              <button
                className={page === "admin" ? "selected" : ""}
                onClick={() => setPage("admin")}
              >
                <Settings2 size={17} />
                Operations
              </button>
            </nav>
          </>
        )}
        <div className="sidebar-bottom">
          <div className="profile-row">
            <span className="profile-initial">{user.name[0]}</span>
            <span>
              <b>{user.name}</b>
              <small>
                {user.role === "admin"
                  ? "Administrator"
                  : "Your planning space"}
              </small>
            </span>
            <button
              title="Edit profile"
              onClick={() => {
                setError("");
                setModal("profile");
              }}
            >
              <Settings2 size={15} />
            </button>
            <button title="Sign out" onClick={logout}>
              <LogOut size={16} />
            </button>
          </div>
        </div>
      </aside>
      <main className="app-main">
        <header className="app-topbar">
          <button
            className="mobile-menu app-menu"
            onClick={() => setMobile(!mobile)}
          >
            <Menu />
          </button>
          <div className="crumb">
            My planning <span>/</span> <b>{title}</b>
          </div>
          <div className="top-right">
            <span className="save-status">
              <span /> Everything saved
            </span>
            <span className="top-avatar" title={user.name}>
              {user.name[0]}
            </span>
          </div>
        </header>
        <div className="page-content">
          {error && (
            <div className="alert">
              <span>{error}</span>
              <button onClick={() => setError("")}>
                <X size={14} />
              </button>
            </div>
          )}
          {notice && (
            <div className="toast">
              <Check size={15} />
              {notice}
            </div>
          )}
          {page === "overview" && (
            <Overview
              user={user}
              event={active}
              bookings={bookings}
              events={events}
              setPage={setPage}
              newEvent={() => setModal("event")}
            />
          )}
          {page === "events" && (
            <EventsPage
              events={events}
              setSelected={setSelected}
              selected={selected}
              setModal={setModal}
              run={run}
              reload={refresh}
            />
          )}
          {page === "venues" && (
            <CatalogPage
              kind="venue"
              items={shownVenues}
              query={query}
              setQuery={setQuery}
              onBook={openBook}
            />
          )}
          {page === "services" && (
            <CatalogPage
              kind="service"
              items={shownVendors}
              query={query}
              setQuery={setQuery}
              onBook={openBook}
            />
          )}
          {page === "bookings" && (
            <BookingsPage
              bookings={bookings}
              adminMode={user.role === "admin"}
              run={run}
            />
          )}
          {page === "budget" && <BudgetPage event={active} />}
          {page === "schedule" && <SchedulePage event={active} />}
          {page === "guests" && <GuestsPage event={active} />}
          {page === "admin" && <AdminPage setPage={setPage} />}
        </div>
      </main>
      {modal && ["event", "edit-event", "function"].includes(modal) && (
        <Modal
          title={
            modal === "function"
              ? "Add a wedding function"
              : modal === "edit-event"
                ? "Edit your wedding"
                : "Create your wedding space"
          }
          onClose={() => setModal("")}
          error={error}
        >
          {modal === "function" ? (
            active && (
              <AddFunction
                event={active}
                run={run}
                onDone={() => setModal("")}
              />
            )
          ) : (
            <EventForm
              event={modal === "edit-event" ? active : undefined}
              onSubmit={submitEvent}
              busy={busy}
            />
          )}
        </Modal>
      )}
      {modal === "profile" && (
        <Modal title="Your profile" onClose={() => setModal("")} error={error}>
          <form className="form-stack" onSubmit={submitProfile}>
            <Field
              label="Name"
              name="name"
              required
              minLength={2}
              defaultValue={user.name}
            />
            <Field
              label="Email address"
              name="email"
              type="email"
              required
              defaultValue={user.email}
            />
            <button className="button button-dark full" disabled={busy}>
              {busy ? "Saving…" : "Save profile"}
            </button>
          </form>
        </Modal>
      )}
    </div>
  );
}

function Field({
  label,
  name,
  type = "text",
  required = false,
  ...props
}: any) {
  return (
    <label>
      {label}
      <input name={name} type={type} required={required} {...props} />
    </label>
  );
}
function Modal({ title, onClose, error, children }: any) {
  return (
    <div
      className="modal-backdrop"
      onMouseDown={(e) => e.target === e.currentTarget && onClose()}
    >
      <section className="modal">
        <div className="modal-head">
          <div>
            <div className="eyebrow">EVERAFTER PLANNING</div>
            <h2>{title}</h2>
          </div>
          <button className="icon-button" onClick={onClose} aria-label="Close">
            <X size={19} />
          </button>
        </div>
        {error && <div className="alert modal-alert">{error}</div>}
        {children}
      </section>
    </div>
  );
}
function Overview({ user, event, bookings, events, setPage, newEvent }: any) {
  const upcoming =
    event &&
    bookings.filter(
      (b: any) =>
        b.event_id === event.id && ["Pending", "Approved"].includes(b.status),
    );
  return (
    <>
      <div className="page-title-row">
        <div>
          <div className="eyebrow">
            {new Date()
              .toLocaleDateString("en-IN", {
                weekday: "long",
                month: "long",
                day: "numeric",
                year: "numeric",
              })
              .toUpperCase()}
          </div>
          <h1>Good day, {user.name.split(" ")[0]}.</h1>
          <p>Here’s where your celebration is taking shape.</p>
        </div>
        <button
          className="button button-dark"
          onClick={() => (events.length ? setPage("events") : newEvent())}
        >
          <Plus size={16} />
          {events.length ? "Edit wedding details" : "Create your wedding"}
        </button>
      </div>
      {!event ? (
        <section className="empty-wedding">
          <span className="empty-icon">
            <Heart size={20} />
          </span>
          <div>
            <div className="eyebrow">YOUR PLANNING SPACE</div>
            <h2>Every beautiful day begins somewhere.</h2>
            <p>
              Start with the essentials. You can add functions, guests, and a
              budget as your plans grow.
            </p>
            <button className="button button-dark" onClick={newEvent}>
              Add your wedding details <ArrowRight size={15} />
            </button>
          </div>
          <div className="empty-illustration"></div>
        </section>
      ) : (
        <>
          <section className="welcome-banner">
            <div className="welcome-copy">
              <span>YOUR CELEBRATION · {event.status.toUpperCase()}</span>
              <h2>
                {event.couple.split("&")[0].trim()} <em>&</em>{" "}
                {event.couple.split("&")[1]?.trim() || "Your wedding"}
              </h2>
              <p>
                <CalendarDays size={14} />
                {dateText(event.date)} <i /> <MapPin size={14} />
                {event.location}
              </p>
              <button className="banner-link" onClick={() => setPage("events")}>
                View wedding details <ArrowRight size={14} />
              </button>
            </div>
            <div className="welcome-photo"></div>
            <div className="banner-number">
              01 <span>/ YOUR DAY</span>
            </div>
          </section>
          <div className="summary-grid">
            <Summary
              label="DAYS TO GO"
              value={Math.max(
                0,
                Math.ceil(
                  (new Date(event.date).getTime() - Date.now()) / 86400000,
                ),
              )}
              note="Until the celebration"
              icon={CalendarDays}
            />
            <Summary
              label="GUESTS"
              value={event.guests}
              note="Estimated attendance"
              icon={Users}
            />
            <Summary
              label="PLANNED BUDGET"
              value={inr(event.budget)}
              note="Your overall plan"
              icon={Wallet}
            />
            <Summary
              label="BOOKINGS"
              value={
                bookings.filter((b: any) => b.event_id === event.id).length
              }
              note={`${upcoming.length} awaiting or confirmed`}
              icon={ClipboardList}
            />
          </div>
          <div className="overview-lower">
            <section className="panel next-panel">
              <div className="panel-heading">
                <div>
                  <div className="eyebrow">COMING TOGETHER</div>
                  <h3>Next on the list</h3>
                </div>
                <button
                  className="link-button"
                  onClick={() => setPage("schedule")}
                >
                  Full schedule <ArrowRight size={14} />
                </button>
              </div>
              <NextItems event={event} />
            </section>
            <section className="panel booking-panel">
              <div className="panel-heading">
                <div>
                  <div className="eyebrow">KEEPING THINGS MOVING</div>
                  <h3>Recent bookings</h3>
                </div>
                <button
                  className="link-button"
                  onClick={() => setPage("bookings")}
                >
                  See all <ArrowRight size={14} />
                </button>
              </div>
              {bookings
                .filter((b: any) => b.event_id === event.id)
                .slice(0, 3)
                .map((b: any) => (
                  <div className="mini-booking" key={b.id}>
                    <span className="booking-icon">
                      <Sparkles size={15} />
                    </span>
                    <div>
                      <b>{b.title}</b>
                      <small>{dateText(b.date)}</small>
                    </div>
                    <Status status={b.status} />
                  </div>
                ))}
              {!bookings.some((b: any) => b.event_id === event.id) && (
                <p className="muted">Your requests will appear here.</p>
              )}
            </section>
          </div>
        </>
      )}
    </>
  );
}
function Summary({ label, value, note, icon: Icon }: any) {
  return (
    <div className="summary-item">
      <div className="summary-top">
        <span>{label}</span>
        <Icon size={16} />
      </div>
      <strong>{value}</strong>
      <small>{note}</small>
    </div>
  );
}
function EventsPage({
  events,
  setSelected,
  selected,
  setModal,
  run,
  reload,
}: any) {
  return (
    <>
      <div className="page-title-row">
        <div>
          <div className="eyebrow">THE BIG PICTURE</div>
          <h1>Your wedding</h1>
          <p>The details that make the day yours.</p>
        </div>
        <button
          className="button button-dark"
          onClick={() => setModal("event")}
        >
          <Plus size={16} />
          Add an event
        </button>
      </div>
      {!events.length ? (
        <div className="empty-state">
          <Heart />
          <h2>Start with the date.</h2>
          <p>
            Add your celebration details and create space for the little things.
          </p>
          <button
            className="button button-dark"
            onClick={() => setModal("event")}
          >
            Create your wedding
          </button>
        </div>
      ) : (
        events.map((ev: Event) => (
          <article
            className={`event-detail ${selected === ev.id ? "active-event" : ""}`}
            key={ev.id}
          >
            <div className="event-detail-head">
              <span className="event-datebox">
                <b>
                  {new Date(`${ev.date}T00:00:00`).toLocaleDateString("en-IN", {
                    day: "2-digit",
                  })}
                </b>
                <small>
                  {new Date(`${ev.date}T00:00:00`)
                    .toLocaleDateString("en-IN", { month: "short" })
                    .toUpperCase()}
                </small>
              </span>
              <div>
                <div className="eyebrow">{ev.status}</div>
                <h2>{ev.couple}</h2>
                <p>
                  <MapPin size={14} />
                  {ev.location} <i /> {ev.guests.toLocaleString("en-IN")} guests
                </p>
              </div>
              <div className="event-buttons">
                <button
                  className="button button-light"
                  onClick={() => {
                    setSelected(ev.id);
                    setModal("edit-event");
                  }}
                >
                  Edit details
                </button>
                <button
                  className="button button-light"
                  onClick={() => setSelected(ev.id)}
                >
                  Select event
                </button>
                <button
                  className="icon-button danger"
                  title="Delete event"
                  onClick={() =>
                    confirm(
                      "Delete this wedding and its related planning data?",
                    ) &&
                    run(async () => {
                      await api(`/events/${ev.id}`, { method: "DELETE" });
                      await reload();
                    }, "Wedding deleted.")
                  }
                >
                  ×
                </button>
              </div>
            </div>
            <div className="event-facts">
              <div>
                <small>WEDDING DATE</small>
                <b>{dateText(ev.date)}</b>
              </div>
              <div>
                <small>PLANNED BUDGET</small>
                <b>{inr(ev.budget)}</b>
              </div>
              <div>
                <small>GUEST COUNT</small>
                <b>{ev.guests.toLocaleString("en-IN")}</b>
              </div>
              <div>
                <small>NOTES</small>
                <b>{ev.notes || "No notes yet"}</b>
              </div>
            </div>
          </article>
        ))
      )}
    </>
  );
}
function CatalogPage({ kind, items, query, setQuery, onBook }: any) {
  const service = kind === "service";
  const [detail, setDetail] = useState<any>(null);
  const [saved, setSaved] = useState<number[]>(() => {
    try {
      return JSON.parse(localStorage.getItem("everafter:saved") || "[]");
    } catch {
      return [];
    }
  });
  const toggleSaved = (id: number) => {
    const next = saved.includes(id)
      ? saved.filter((x) => x !== id)
      : [...saved, id];
    setSaved(next);
    localStorage.setItem("everafter:saved", JSON.stringify(next));
  };
  return (
    <>
      <div className="page-title-row">
        <div>
          <div className="eyebrow">
            {service ? "THOUGHTFUL PEOPLE" : "PLACES TO CELEBRATE"}
          </div>
          <h1>{service ? "Meet the makers" : "Find your venue"}</h1>
          <p>
            {service
              ? "Small teams with a point of view and a way of making things feel special."
              : "Explore considered spaces for a gathering that feels like yours."}
          </p>
        </div>
      </div>
      <div className="catalog-toolbar">
        <label className="searchbox">
          <Search size={16} />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={
              service
                ? "Search services, category or location"
                : "Search name, place or style"
            }
          />
        </label>
        <span>
          {items.length} {service ? "providers" : "spaces"}
        </span>
      </div>
      {!items.length ? (
        <div className="empty-state">
          <p>Nothing found. Try another search.</p>
        </div>
      ) : (
        <div className="catalog-grid">
          {items.map((item: any, i: number) => (
            <article className="catalog-card" key={item.id}>
              <div
                className={`catalog-image ${service ? "vendor-image" : "venue-image"} image-${(i % 3) + 1}`}
                style={{ backgroundImage: `url('${item.image}')` }}
              >
                <span>{service ? item.category : item.type}</span>
                {item.is_demo === 1 && (
                  <small className="demo-mark">SAMPLE</small>
                )}
                <button
                  className="favorite"
                  title={
                    saved.includes(item.id)
                      ? "Remove from saved"
                      : "Save for later"
                  }
                  aria-pressed={saved.includes(item.id)}
                  onClick={() => toggleSaved(item.id)}
                >
                  <Heart
                    size={17}
                    fill={saved.includes(item.id) ? "currentColor" : "none"}
                  />
                </button>
              </div>
              <div className="catalog-info">
                <div className="catalog-heading">
                  <h3>{item.name}</h3>
                  <p>
                    <MapPin size={13} />
                    {item.location}
                  </p>
                </div>
                <p className="catalog-description">{item.description}</p>
                <ProviderReviews
                  vendorId={item.id}
                  resource={service ? "vendors" : "venues"}
                />
                {!service && item.facilities && (
                  <div className="venue-facilities">
                    {String(item.facilities)
                      .split(",")
                      .slice(0, 4)
                      .map((facility: string) => (
                        <span key={facility}>{facility.trim()}</span>
                      ))}
                  </div>
                )}
                {service ? (
                  <>
                    <div className="packages">
                      {(typeof item.packages === "string"
                        ? JSON.parse(item.packages || "[]")
                        : item.packages || []
                      ).map((p: any) => (
                        <div className="package-row" key={p.id}>
                          <span>
                            <b>{p.name}</b>
                            <small>{p.description}</small>
                          </span>
                          <span className="package-price">
                            {inr(p.price)}
                            <button
                              onClick={() =>
                                onBook(
                                  "package",
                                  p.id,
                                  `${item.name} — ${p.name}`,
                                  p.price,
                                )
                              }
                            >
                              Request
                            </button>
                          </span>
                        </div>
                      ))}
                    </div>
                  </>
                ) : (
                  <>
                    <div className="catalog-foot">
                      <span>Up to {item.capacity} guests</span>
                      <b>from {inr(item.price)}</b>
                    </div>
                    <button
                      className="link-button venue-details-link"
                      onClick={() => setDetail(item)}
                    >
                      Venue details <ArrowRight size={13} />
                    </button>
                  </>
                )}
                {!service && (
                  <button
                    className="button button-light full"
                    onClick={() =>
                      onBook("venue", item.id, item.name, item.price)
                    }
                  >
                    Request this venue <ArrowRight size={14} />
                  </button>
                )}
              </div>
            </article>
          ))}
        </div>
      )}
      {detail && (
        <Modal title={detail.name} onClose={() => setDetail(null)}>
          <div className="venue-detail-body">
            <img src={detail.image} alt={detail.name} />
            <p>{detail.description}</p>
            <div>
              <MapPin size={14} /> {detail.location} <span>·</span>{" "}
              {detail.type}
            </div>
            <div>
              <Users size={14} /> Capacity up to {detail.capacity} guests
            </div>
            <strong>From {inr(detail.price)}</strong>
            <section>
              <small>FACILITIES</small>
              <p>
                {detail.facilities ||
                  "Ask the venue about available facilities."}
              </p>
            </section>
            <p className="availability-note">
              Availability is confirmed by the venue after your request. Sending
              a request does not confirm a booking.
            </p>
            <button
              className="button button-dark full"
              onClick={() => {
                setDetail(null);
                onBook("venue", detail.id, detail.name, detail.price);
              }}
            >
              Request this venue <ArrowRight size={14} />
            </button>
          </div>
        </Modal>
      )}
    </>
  );
}
function ProviderReviews({
  vendorId,
  resource,
}: {
  vendorId: number;
  resource: string;
}) {
  const [reviews, setReviews] = useState<any[]>([]);
  useEffect(() => {
    api(`/catalog/${resource}/${vendorId}/reviews`)
      .then(setReviews)
      .catch(() => setReviews([]));
  }, [vendorId, resource]);
  if (!reviews.length) return null;
  const average =
    reviews.reduce((sum, review) => sum + review.rating, 0) / reviews.length;
  return (
    <div className="provider-reviews">
      <span className="review-score">
        <Star size={11} fill="currentColor" /> {average.toFixed(1)}
      </span>
      <small>
        {reviews.length} published {reviews.length === 1 ? "review" : "reviews"}
      </small>
    </div>
  );
}
function Status({ status }: any) {
  return (
    <span className={`status status-${String(status).toLowerCase()}`}>
      {status}
    </span>
  );
}
function BookingsPage({ bookings, adminMode, run }: any) {
  return (
    <>
      <div className="page-title-row">
        <div>
          <div className="eyebrow">REQUESTS & CONFIRMATIONS</div>
          <h1>{adminMode ? "Booking requests" : "Your bookings"}</h1>
          <p>
            {adminMode
              ? "Review incoming requests and record the next step."
              : "Every request, with its status kept clear."}
          </p>
        </div>
      </div>
      {!bookings.length ? (
        <div className="empty-state">
          <ClipboardList />
          <h2>No booking requests yet.</h2>
          <p>
            When you find the right place or person, start a request from their
            listing.
          </p>
        </div>
      ) : (
        <div className="data-table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                {adminMode && <th>Customer</th>}
                <th>Service or venue</th>
                <th>Wedding</th>
                <th>Requested date</th>
                <th>Price</th>
                <th>Status</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {bookings.map((b: any) => (
                <tr key={b.id}>
                  {adminMode && <td>{b.customer}</td>}
                  <td>
                    <b>{b.title}</b>
                    {b.status_note && <small>{b.status_note}</small>}
                  </td>
                  <td>{b.event}</td>
                  <td>{dateText(b.date)}</td>
                  <td>{inr(b.price)}</td>
                  <td>
                    <Status status={b.status} />
                  </td>
                  <td>
                    {adminMode && b.status === "Pending" ? (
                      <div className="table-actions">
                        <button
                          onClick={() =>
                            run(
                              () =>
                                api(`/bookings/${b.id}/status`, {
                                  method: "PUT",
                                  body: JSON.stringify({
                                    status: "Approved",
                                    note: "Approved by planning team.",
                                  }),
                                }),
                              "Booking approved.",
                            )
                          }
                        >
                          Approve
                        </button>
                        <button
                          onClick={() =>
                            run(
                              () =>
                                api(`/bookings/${b.id}/status`, {
                                  method: "PUT",
                                  body: JSON.stringify({
                                    status: "Rejected",
                                    note: "Unable to accommodate this request.",
                                  }),
                                }),
                              "Booking declined.",
                            )
                          }
                        >
                          Decline
                        </button>
                      </div>
                    ) : adminMode && b.status === "Approved" ? (
                      <button
                        className="table-link"
                        onClick={() =>
                          run(
                            () =>
                              api(`/bookings/${b.id}/status`, {
                                method: "PUT",
                                body: JSON.stringify({
                                  status: "Completed",
                                  note: "Service completed.",
                                }),
                              }),
                            "Booking marked completed.",
                          )
                        }
                      >
                        Mark completed
                      </button>
                    ) : !adminMode && b.status === "Completed" ? (
                      <button
                        className="table-link"
                        onClick={async () => {
                          const rating = Number(
                            prompt(
                              "How would you rate this service? Choose 1 to 5.",
                              "5",
                            ),
                          );
                          if (!rating) return;
                          const body = prompt(
                            "Share a few words about your experience.",
                          );
                          if (!body) return;
                          try {
                            await api(`/bookings/${b.id}/reviews`, {
                              method: "POST",
                              body: JSON.stringify({ rating, body }),
                            });
                            alert(
                              "Thank you. Your review is waiting for moderation.",
                            );
                          } catch (err) {
                            alert((err as Error).message);
                          }
                        }}
                      >
                        Write a review
                      </button>
                    ) : (
                      !adminMode &&
                      ["Pending", "Approved"].includes(b.status) && (
                        <button
                          className="table-link"
                          onClick={() =>
                            confirm("Cancel this booking request?") &&
                            run(
                              () =>
                                api(`/bookings/${b.id}/cancel`, {
                                  method: "POST",
                                }),
                              "Booking cancelled.",
                            )
                          }
                        >
                          Cancel
                        </button>
                      )
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
function EventForm({ event, onSubmit, busy }: any) {
  return (
    <form onSubmit={onSubmit} className="form-stack">
      <Field
        label="Wedding name"
        name="name"
        required
        defaultValue={event?.name || "Our Wedding"}
      />
      <Field
        label="Couple names"
        name="couple"
        required
        defaultValue={event?.couple || ""}
        placeholder="e.g. Mira & Kunal"
      />
      <div className="form-two">
        <Field
          label="Wedding date"
          name="date"
          type="date"
          required
          defaultValue={event?.date || ""}
        />
        <Field
          label="Location"
          name="location"
          required
          defaultValue={event?.location || ""}
          placeholder="City, state"
        />
      </div>
      <div className="form-two">
        <Field
          label="Estimated guests"
          name="guests"
          type="number"
          min="0"
          required
          defaultValue={event?.guests || 0}
        />
        <Field
          label="Overall budget (INR)"
          name="budget"
          type="number"
          min="0"
          step="1000"
          required
          defaultValue={event?.budget || 0}
        />
      </div>
      <label>
        Notes
        <textarea
          name="notes"
          rows={3}
          defaultValue={event?.notes || ""}
          placeholder="The feeling, priorities or details you want to remember…"
        />
      </label>
      <button className="button button-dark full" disabled={busy}>
        {busy ? "Saving…" : "Save wedding details"}
      </button>
    </form>
  );
}
function AddFunction({ event, run, onDone }: any) {
  return (
    <details className="add-function">
      <summary>
        <Plus size={15} /> Add a ceremony or function
      </summary>
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          const f = new FormData(e.currentTarget as HTMLFormElement);
          await run(
            () =>
              api(`/events/${event.id}/functions`, {
                method: "POST",
                body: JSON.stringify(Object.fromEntries(f)),
              }),
            "Function added.",
          );
          onDone();
        }}
        className="form-stack"
      >
        <Field
          label="Function"
          name="name"
          required
          placeholder="Mehndi, Sangeet, Wedding…"
        />
        <div className="form-two">
          <Field label="Date" name="date" type="date" required />
          <Field label="Time" name="time" type="time" />
        </div>
        <Field label="Venue" name="venue" />
        <label>
          Details
          <textarea name="description" rows={2} />
        </label>
        <button className="button button-dark full">Add function</button>
      </form>
    </details>
  );
}
function NextItems({ event }: any) {
  const [items, setItems] = useState<any[]>([]);
  useEffect(() => {
    api(`/events/${event.id}/functions`).then(setItems);
  }, [event.id]);
  return (
    <>
      {items.map((it: any) => (
        <div className="schedule-line" key={it.id}>
          <span className="schedule-date">
            <b>
              {new Date(`${it.date}T00:00:00`).toLocaleDateString("en-IN", {
                day: "2-digit",
              })}
            </b>
            <small>
              {new Date(`${it.date}T00:00:00`)
                .toLocaleDateString("en-IN", { month: "short" })
                .toUpperCase()}
            </small>
          </span>
          <div>
            <b>{it.name}</b>
            <small>
              {it.time || "Time to be decided"}
              {it.venue ? ` · ${it.venue}` : ""}
            </small>
          </div>
          <span className="small-status">{it.status}</span>
        </div>
      ))}
      {!items.length && (
        <div className="schedule-empty">
          <CalendarDays size={18} />
          <p>Your ceremonies and functions will appear here.</p>
          <span>Add one from your wedding details.</span>
        </div>
      )}
    </>
  );
}
function SchedulePage({ event }: any) {
  const [items, setItems] = useState<any[]>([]);
  const [open, setOpen] = useState(false);
  useEffect(() => {
    event && api(`/events/${event.id}/functions`).then(setItems);
  }, [event?.id]);
  return (
    <>
      <div className="page-title-row">
        <div>
          <div className="eyebrow">THE RHYTHM OF YOUR DAY</div>
          <h1>Your schedule</h1>
          <p>Put the moments in order, one function at a time.</p>
        </div>
        {event && (
          <button className="button button-dark" onClick={() => setOpen(!open)}>
            <Plus size={15} />
            Add a function
          </button>
        )}
      </div>
      {open && event && (
        <AddFunction
          event={event}
          run={async (fn: any, msg: any) => {
            await fn();
            const x = await api(`/events/${event.id}/functions`);
            setItems(x);
          }}
          onDone={() => setOpen(false)}
        />
      )}
      {!event ? (
        <div className="empty-state">
          <p>Add your wedding details to start a schedule.</p>
        </div>
      ) : !items.length ? (
        <div className="empty-state">
          <CalendarDays />
          <h2>Make a little room in the day.</h2>
          <p>Add your engagement, mehndi, sangeet or ceremony.</p>
          <button className="button button-dark" onClick={() => setOpen(true)}>
            Add first function
          </button>
        </div>
      ) : (
        <div className="timeline">
          {items.map((it: any) => (
            <article key={it.id} className="timeline-item">
              <span className="timeline-dot" />
              <time>
                {dateText(it.date)}
                {it.time && ` · ${it.time}`}
              </time>
              <h3>{it.name}</h3>
              <p>
                {it.description ||
                  "Details will go here as plans come together."}
              </p>
              <small>{it.venue || "Venue to be decided"}</small>
              <div className="timeline-actions">
                <button
                  className="table-link"
                  onClick={async () => {
                    const name = prompt("Function name", it.name);
                    if (name === null) return;
                    const date = prompt("Date (YYYY-MM-DD)", it.date);
                    if (date === null) return;
                    const time = prompt("Time (HH:MM)", it.time || "");
                    if (time === null) return;
                    const venue = prompt("Venue", it.venue || "");
                    if (venue === null) return;
                    const description = prompt(
                      "Description",
                      it.description || "",
                    );
                    if (description === null) return;
                    try {
                      await api(`/functions/${it.id}`, {
                        method: "PUT",
                        body: JSON.stringify({
                          ...it,
                          name,
                          date,
                          time,
                          venue,
                          description,
                        }),
                      });
                      setItems(await api(`/events/${event.id}/functions`));
                    } catch (err) {
                      alert((err as Error).message);
                    }
                  }}
                >
                  Edit
                </button>
                <button
                  className="table-link"
                  onClick={async () => {
                    if (confirm(`Remove ${it.name} from the schedule?`)) {
                      await api(`/functions/${it.id}`, { method: "DELETE" });
                      setItems(await api(`/events/${event.id}/functions`));
                    }
                  }}
                >
                  Remove
                </button>
              </div>
            </article>
          ))}
        </div>
      )}
    </>
  );
}
function GuestsPage({ event }: any) {
  const [items, setItems] = useState<any[]>([]),
    [search, setSearch] = useState(""),
    [functions, setFunctions] = useState<any[]>([]);
  const load = () => {
    if (!event) return;
    api(`/events/${event.id}/guests`).then(setItems);
    api(`/events/${event.id}/functions`).then(setFunctions);
  };
  useEffect(load, [event?.id]);
  const add = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const form = e.currentTarget;
    try {
      await api(`/events/${event.id}/guests`, {
        method: "POST",
        body: JSON.stringify(Object.fromEntries(new FormData(form))),
      });
      form.reset();
      load();
    } catch (err) {
      alert((err as Error).message);
    }
  };
  return (
    <>
      <div className="page-title-row">
        <div>
          <div className="eyebrow">THE PEOPLE YOU LOVE</div>
          <h1>Your guests</h1>
          <p>Keep names and replies together, without losing the human part.</p>
        </div>
        <span className="guest-count">
          <b>{items.filter((g) => g.rsvp === "Yes").length}</b> of{" "}
          {items.length} replied yes
        </span>
      </div>
      {event && (
        <form className="guest-add" onSubmit={add}>
          <Field label="Guest name" name="name" required />
          <Field label="Email" name="email" type="email" />
          <Field label="Phone" name="phone" />
          <label>
            Wedding function
            <select name="functionId" defaultValue="">
              <option value="">Not assigned</option>
              {functions.map((fn) => (
                <option key={fn.id} value={fn.id}>
                  {fn.name}
                </option>
              ))}
            </select>
          </label>
          <button className="button button-dark">
            <Plus size={15} />
            Add guest
          </button>
        </form>
      )}
      <div className="catalog-toolbar">
        <label className="searchbox">
          <Search size={16} />
          <input
            placeholder="Find a guest"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </label>
        <span>{items.length} invited</span>
      </div>
      <div className="data-table-wrap">
        <table className="data-table">
          <thead>
            <tr>
              <th>Name</th>
              <th>Contact</th>
              <th>Function</th>
              <th>RSVP</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {items
              .filter((g) =>
                g.name.toLowerCase().includes(search.toLowerCase()),
              )
              .map((g) => (
                <tr key={g.id}>
                  <td>
                    <b>{g.name}</b>
                  </td>
                  <td>{g.email || g.phone || "—"}</td>
                  <td>
                    <select
                      value={g.function_id || ""}
                      onChange={async (e) => {
                        await api(`/guests/${g.id}`, {
                          method: "PATCH",
                          body: JSON.stringify({
                            rsvp: g.rsvp,
                            functionId: e.target.value || null,
                          }),
                        });
                        load();
                      }}
                    >
                      <option value="">Not assigned</option>
                      {functions.map((fn) => (
                        <option key={fn.id} value={fn.id}>
                          {fn.name}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td>
                    <select
                      value={g.rsvp}
                      onChange={async (e) => {
                        await api(`/guests/${g.id}`, {
                          method: "PATCH",
                          body: JSON.stringify({
                            rsvp: e.target.value,
                            functionId: g.function_id || null,
                          }),
                        });
                        load();
                      }}
                    >
                      <option>Pending</option>
                      <option>Yes</option>
                      <option>No</option>
                    </select>
                  </td>
                  <td>
                    <button
                      className="table-link"
                      onClick={async () => {
                        if (confirm(`Remove ${g.name}?`)) {
                          await api(`/guests/${g.id}`, { method: "DELETE" });
                          load();
                        }
                      }}
                    >
                      Remove
                    </button>
                  </td>
                </tr>
              ))}
          </tbody>
        </table>
        {!items.length && (
          <div className="table-empty">
            No guests added yet. Begin with the people closest to you.
          </div>
        )}
      </div>
    </>
  );
}
function BudgetPage({ event }: any) {
  const [data, setData] = useState<any>({
      items: [],
      totals: { estimated: 0, actual: 0 },
    }),
    [show, setShow] = useState(false),
    [editing, setEditing] = useState<any>(null),
    [loading, setLoading] = useState(false),
    [loadError, setLoadError] = useState(""),
    [suggestedCategory, setSuggestedCategory] = useState("");
  const load = async () => {
    if (!event) return;
    setLoading(true);
    try {
      setData(await api(`/events/${event.id}/expenses`));
      setLoadError("");
    } catch (e) {
      setLoadError((e as Error).message);
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => {
    void load();
  }, [event?.id]);
  const add = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const form = e.currentTarget;
    try {
      await api(
        editing ? `/expenses/${editing.id}` : `/events/${event.id}/expenses`,
        {
          method: editing ? "PUT" : "POST",
          body: JSON.stringify(Object.fromEntries(new FormData(form))),
        },
      );
      form.reset();
      setEditing(null);
      setSuggestedCategory("");
      setShow(false);
      await load();
    } catch (e) {
      setLoadError((e as Error).message);
    }
  };
  const remaining = (event?.budget || 0) - data.totals.actual;
  const categoryTotals = Object.values(
    data.items.reduce(
      (totals: any, item: any) => {
        totals[item.category] = totals[item.category] || {
          category: item.category,
          actual: 0,
          estimated: 0,
        };
        totals[item.category].actual += item.actual;
        totals[item.category].estimated += item.estimated;
        return totals;
      },
      {} as Record<
        string,
        { category: string; actual: number; estimated: number }
      >,
    ),
  ) as Array<{ category: string; actual: number; estimated: number }>;
  const maxCategorySpend = Math.max(
    1,
    ...categoryTotals.map((item) => item.actual),
  );
  return (
    <>
      <div className="page-title-row">
        <div>
          <div className="eyebrow">A CLEAR VIEW OF THE NUMBERS</div>
          <h1>Your budget</h1>
          <p>Every amount gathered in one practical place.</p>
        </div>
        {event && (
          <button
            className="button button-dark"
            onClick={() => {
              if (!show) {
                setEditing(null);
                setSuggestedCategory("");
              }
              setShow(!show);
            }}
          >
            <Plus size={15} />
            Add an expense
          </button>
        )}
      </div>
      {!event ? (
        <div className="empty-state">
          <Wallet />
          <p>Create a wedding to manage its budget.</p>
        </div>
      ) : (
        <>
          {loadError && <div className="alert">{loadError}</div>}
          <div className="budget-overview">
            <div className="budget-main">
              <small>OVERALL BUDGET</small>
              <strong>{inr(event.budget)}</strong>
              <div className="budget-bar">
                <span
                  style={{
                    width: `${Math.min(100, event.budget ? (data.totals.actual / event.budget) * 100 : 0)}%`,
                  }}
                />
              </div>
              <div className="budget-legend">
                <span>{inr(data.totals.actual)} spent</span>
                <span>{inr(Math.max(0, remaining))} remaining</span>
              </div>
            </div>
            <div className="budget-stat">
              <small>ESTIMATED EXPENSES</small>
              <b>{inr(data.totals.estimated)}</b>
            </div>
            <div className="budget-stat">
              <small>ACTUAL SPEND</small>
              <b>{inr(data.totals.actual)}</b>
              <span className={remaining < 0 ? "over-budget" : ""}>
                {remaining < 0
                  ? `${inr(Math.abs(remaining))} over budget`
                  : "Within overall budget"}
              </span>
            </div>
          </div>
          {categoryTotals.length > 0 && (
            <section className="category-breakdown">
              <div className="eyebrow">ACTUAL SPENDING BY CATEGORY</div>
              {categoryTotals.map((item) => (
                <div className="category-row" key={item.category}>
                  <span>{item.category}</span>
                  <div className="category-bar">
                    <i
                      style={{
                        width: `${Math.max(2, (item.actual / maxCategorySpend) * 100)}%`,
                      }}
                    />
                  </div>
                  <b>{inr(item.actual)}</b>
                </div>
              ))}
            </section>
          )}
          {show && (
            <form onSubmit={add} className="expense-form">
              <Field
                label="Category"
                name="category"
                required
                placeholder="Venue, catering…"
                defaultValue={editing?.category || suggestedCategory}
              />
              <Field
                label="Description"
                name="description"
                required
                defaultValue={editing?.description || ""}
              />
              <Field
                label="Estimated (₹)"
                name="estimated"
                type="number"
                min="0"
                required
                defaultValue={editing?.estimated ?? ""}
              />
              <Field
                label="Actual (₹)"
                name="actual"
                type="number"
                min="0"
                defaultValue={editing?.actual ?? 0}
                required
              />
              <Field
                label="Due date"
                name="dueDate"
                type="date"
                defaultValue={editing?.due_date || ""}
              />
              <button className="button button-dark">
                {editing ? "Update expense" : "Save expense"}
              </button>
            </form>
          )}
          <div className="data-table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Category</th>
                  <th>Description</th>
                  <th>Due date</th>
                  <th>Estimated</th>
                  <th>Actual</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {data.items.map((x: any) => (
                  <tr key={x.id}>
                    <td>
                      <span className="category-label">{x.category}</span>
                    </td>
                    <td>{x.description}</td>
                    <td>{dateText(x.due_date)}</td>
                    <td>{inr(x.estimated)}</td>
                    <td>
                      <b>{inr(x.actual)}</b>
                    </td>
                    <td>
                      <button
                        className="table-link"
                        onClick={() => {
                          setEditing(x);
                          setShow(true);
                        }}
                      >
                        Edit
                      </button>
                      <button
                        className="table-link"
                        onClick={async () => {
                          if (confirm("Remove this expense?")) {
                            try {
                              await api(`/expenses/${x.id}`, {
                                method: "DELETE",
                              });
                              if (editing?.id === x.id) {
                                setEditing(null);
                                setShow(false);
                              }
                              await load();
                            } catch (e) {
                              setLoadError((e as Error).message);
                            }
                          }
                        }}
                      >
                        Remove
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {!data.items.length && (
              <div className="budget-empty">
                <div>
                  <strong>
                    {loading
                      ? "Loading your expenses…"
                      : "Start with your first expense"}
                  </strong>
                  <p>
                    Add an estimate for a venue, catering, or another part of
                    your celebration. Your totals update as you plan.
                  </p>
                </div>
                <div className="budget-shortcuts">
                  {["Venue", "Catering", "Photography", "Decoration"].map(
                    (category) => (
                      <button
                        key={category}
                        onClick={() => {
                          setSuggestedCategory(category);
                          setEditing(null);
                          setShow(true);
                        }}
                      >
                        <Plus size={13} /> {category}
                      </button>
                    ),
                  )}
                </div>
              </div>
            )}
          </div>
        </>
      )}
    </>
  );
}
function AdminPage({ setPage }: any) {
  const [data, setData] = useState<any>(null),
    [tab, setTab] = useState("activity"),
    [cat, setCat] = useState<any>({ venues: [], vendors: [] }),
    [reviews, setReviews] = useState<any[]>([]),
    [customers, setCustomers] = useState<any[]>([]),
    [customerSearch, setCustomerSearch] = useState("");
  const load = () => {
    api("/admin/summary")
      .then(setData)
      .catch(() => setData({ error: true }));
    api("/admin/catalog")
      .then(setCat)
      .catch(() => {});
    api("/admin/reviews")
      .then(setReviews)
      .catch(() => {});
    api("/admin/customers")
      .then(setCustomers)
      .catch(() => {});
  };
  useEffect(load, []);
  const submit = async (e: React.FormEvent<HTMLFormElement>, path: string) => {
    e.preventDefault();
    const form = e.currentTarget;
    try {
      const fields = new FormData(form);
      const imageFile = fields.get("imageFile");
      fields.delete("imageFile");
      const values: any = Object.fromEntries(fields);
      if (imageFile instanceof File && imageFile.size > 0) {
        const uploadForm = new FormData();
        uploadForm.append("image", imageFile);
        const uploaded = await api("/upload", {
          method: "POST",
          body: uploadForm,
        });
        values.image = uploaded.url;
      }
      await api(path, {
        method: "POST",
        body: JSON.stringify(values),
      });
      form.reset();
      load();
    } catch (err) {
      alert((err as Error).message);
    }
  };
  const moderate = async (id: number, status: string) => {
    await api(`/admin/reviews/${id}`, {
      method: "PATCH",
      body: JSON.stringify({ status }),
    });
    load();
  };
  return (
    <>
      <div className="page-title-row">
        <div>
          <div className="eyebrow">EVERAFTER OPERATIONS</div>
          <h1>Good work, admin.</h1>
          <p>Activity and requests from your local planning workspace.</p>
        </div>
      </div>
      {data?.error ? (
        <div className="alert">Administrator access is required.</div>
      ) : !data ? (
        <div className="loading-line">Loading current records…</div>
      ) : (
        <>
          <div className="admin-stats">
            <Summary
              label="CUSTOMERS"
              value={data.customers}
              note="Registered accounts"
              icon={Users}
            />
            <Summary
              label="ACTIVE VENUES"
              value={data.venues}
              note="Available to browse"
              icon={MapPin}
            />
            <Summary
              label="ACTIVE SERVICES"
              value={data.services}
              note="Service providers"
              icon={Sparkles}
            />
            <Summary
              label="PENDING REQUESTS"
              value={data.pending}
              note="Awaiting a decision"
              icon={Clock3}
            />
          </div>
          <div className="admin-tabs">
            {[
              ["activity", "Activity"],
              ["catalog", "Catalogue"],
              ["customers", "Customers"],
              ["reviews", "Reviews"],
            ].map(([id, label]) => (
              <button
                className={tab === id ? "active" : ""}
                key={id}
                onClick={() => setTab(id)}
              >
                {label}
              </button>
            ))}
            {tab === "activity" && (
              <button
                className="link-button"
                onClick={() => setPage("bookings")}
              >
                Review booking requests <ArrowRight size={14} />
              </button>
            )}
          </div>
          {tab === "activity" && (
            <>
              <div className="admin-status-row">
                <div>
                  <small>APPROVED</small>
                  <b>{data.approved}</b>
                </div>
                <div>
                  <small>REJECTED</small>
                  <b>{data.rejected}</b>
                </div>
              </div>
              <h3 className="table-title">Recent booking activity</h3>
              <div className="data-table-wrap">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Customer</th>
                      <th>Request</th>
                      <th>Wedding</th>
                      <th>Date</th>
                      <th>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.recent.map((b: any) => (
                      <tr key={b.id}>
                        <td>{b.customer}</td>
                        <td>
                          <b>{b.title}</b>
                        </td>
                        <td>{b.event}</td>
                        <td>{dateText(b.date)}</td>
                        <td>
                          <Status status={b.status} />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
          {tab === "catalog" && (
            <>
              <div className="admin-create-grid">
                <form
                  className="admin-create"
                  onSubmit={(e) => submit(e, "/admin/venues")}
                >
                  <h3>Add a venue</h3>
                  <Field label="Name" name="name" required />
                  <Field label="Description" name="description" required />
                  <div className="form-two">
                    <Field label="Location" name="location" required />
                    <Field label="Venue type" name="type" required />
                  </div>
                  <div className="form-two">
                    <Field
                      label="Capacity"
                      name="capacity"
                      type="number"
                      required
                    />
                    <Field
                      label="Starting price (₹)"
                      name="price"
                      type="number"
                      required
                    />
                  </div>
                  <Field label="Facilities" name="facilities" />
                  <label className="upload-field">
                    Local venue image
                    <input
                      name="imageFile"
                      type="file"
                      accept="image/jpeg,image/png,image/webp"
                    />
                  </label>
                  <button className="button button-dark">Add venue</button>
                </form>
                <form
                  className="admin-create"
                  onSubmit={(e) => submit(e, "/admin/vendors")}
                >
                  <h3>Add a service provider</h3>
                  <Field label="Business name" name="name" required />
                  <Field label="Description" name="description" required />
                  <div className="form-two">
                    <label>
                      Category
                      <select name="category">
                        <option>Catering</option>
                        <option>Decoration</option>
                        <option>Photography</option>
                        <option>Floral</option>
                        <option>Lighting</option>
                        <option>Other</option>
                      </select>
                    </label>
                    <Field label="Location" name="location" required />
                  </div>
                  <Field label="Contact email" name="contact" type="email" />
                  <label className="upload-field">
                    Local provider image
                    <input
                      name="imageFile"
                      type="file"
                      accept="image/jpeg,image/png,image/webp"
                    />
                  </label>
                  <button className="button button-dark">Add provider</button>
                </form>
              </div>
              <form
                className="admin-create package-create"
                onSubmit={(e) => submit(e, "/admin/packages")}
              >
                <h3>Add a service package</h3>
                <div className="form-two">
                  <label>
                    Provider
                    <select name="vendorId">
                      {cat.vendors.map((v: any) => (
                        <option value={v.id} key={v.id}>
                          {v.name}
                        </option>
                      ))}
                    </select>
                  </label>
                  <Field label="Package name" name="name" required />
                </div>
                <div className="form-two">
                  <Field label="Description" name="description" />
                  <Field
                    label="Price (₹)"
                    name="price"
                    type="number"
                    required
                  />
                </div>
                <button className="button button-dark">Add package</button>
              </form>
              <h3 className="table-title">Catalogue records</h3>
              <div className="data-table-wrap">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Type</th>
                      <th>Name</th>
                      <th>Category or location</th>
                      <th>Starting price</th>
                      <th>Status</th>
                      <th></th>
                    </tr>
                  </thead>
                  <tbody>
                    {cat.venues.map((v: any) => (
                      <tr key={`v${v.id}`}>
                        <td>Venue</td>
                        <td>
                          <b>{v.name}</b>
                        </td>
                        <td>
                          {v.location} · {v.type}
                        </td>
                        <td>{inr(v.price)}</td>
                        <td>
                          <Status status={v.active ? "Active" : "Inactive"} />
                        </td>
                        <td>
                          <button
                            className="table-link"
                            onClick={async () => {
                              const name = prompt("Venue name", v.name);
                              if (name === null) return;
                              const location = prompt("Location", v.location);
                              if (location === null) return;
                              const price = Number(
                                prompt(
                                  "Starting price in INR",
                                  String(v.price),
                                ),
                              );
                              if (!Number.isFinite(price) || price < 0) return;
                              await api(`/admin/venues/${v.id}`, {
                                method: "PUT",
                                body: JSON.stringify({
                                  ...v,
                                  name,
                                  location,
                                  price,
                                }),
                              });
                              load();
                            }}
                          >
                            Edit
                          </button>
                          <button
                            className="table-link"
                            onClick={async () => {
                              if (
                                v.active &&
                                confirm(`Deactivate ${v.name}?`)
                              ) {
                                await api(`/admin/venues/${v.id}`, {
                                  method: "DELETE",
                                });
                                load();
                              } else if (!v.active) {
                                await api(`/admin/venues/${v.id}`, {
                                  method: "PUT",
                                  body: JSON.stringify({ ...v, active: 1 }),
                                });
                                load();
                              }
                            }}
                          >
                            {v.active ? "Deactivate" : "Reactivate"}
                          </button>
                          <button
                            className="table-link"
                            onClick={async () => {
                              if (confirm(`Permanently delete ${v.name}?`)) {
                                await api(`/admin/venues/${v.id}/permanent`, {
                                  method: "DELETE",
                                });
                                load();
                              }
                            }}
                          >
                            Delete
                          </button>
                        </td>
                      </tr>
                    ))}
                    {cat.vendors.map((v: any) => (
                      <tr key={`s${v.id}`}>
                        <td>Service</td>
                        <td>
                          <b>{v.name}</b>
                        </td>
                        <td>
                          {v.category} · {v.location}
                        </td>
                        <td>Packages available</td>
                        <td>
                          <Status status={v.active ? "Active" : "Inactive"} />
                        </td>
                        <td>
                          <button
                            className="table-link"
                            onClick={async () => {
                              const name = prompt("Provider name", v.name);
                              if (name === null) return;
                              const category = prompt(
                                "Service category",
                                v.category,
                              );
                              if (category === null) return;
                              const location = prompt("Location", v.location);
                              if (location === null) return;
                              await api(`/admin/vendors/${v.id}`, {
                                method: "PUT",
                                body: JSON.stringify({
                                  ...v,
                                  name,
                                  category,
                                  location,
                                }),
                              });
                              load();
                            }}
                          >
                            Edit
                          </button>
                          <button
                            className="table-link"
                            onClick={async () => {
                              if (
                                v.active &&
                                confirm(`Deactivate ${v.name}?`)
                              ) {
                                await api(`/admin/vendors/${v.id}`, {
                                  method: "DELETE",
                                });
                                load();
                              } else if (!v.active) {
                                await api(`/admin/vendors/${v.id}`, {
                                  method: "PUT",
                                  body: JSON.stringify({ ...v, active: 1 }),
                                });
                                load();
                              }
                            }}
                          >
                            {v.active ? "Deactivate" : "Reactivate"}
                          </button>
                          <button
                            className="table-link"
                            onClick={async () => {
                              if (confirm(`Permanently delete ${v.name}?`)) {
                                try {
                                  await api(
                                    `/admin/vendors/${v.id}/permanent`,
                                    { method: "DELETE" },
                                  );
                                  load();
                                } catch (err) {
                                  alert((err as Error).message);
                                }
                              }
                            }}
                          >
                            Delete
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <h3 className="table-title">Service packages</h3>
              <div className="data-table-wrap">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Provider</th>
                      <th>Package</th>
                      <th>Description</th>
                      <th>Price</th>
                      <th>Status</th>
                      <th></th>
                    </tr>
                  </thead>
                  <tbody>
                    {cat.vendors.flatMap((v: any) =>
                      (typeof v.packages === "string"
                        ? JSON.parse(v.packages || "[]")
                        : v.packages || []
                      ).map((p: any) => (
                        <tr key={`p${p.id}`}>
                          <td>{v.name}</td>
                          <td>
                            <b>{p.name}</b>
                          </td>
                          <td>{p.description}</td>
                          <td>{inr(p.price)}</td>
                          <td>
                            <Status status={p.active ? "Active" : "Inactive"} />
                          </td>
                          <td>
                            <button
                              className="table-link"
                              onClick={async () => {
                                const name = prompt("Package name", p.name);
                                if (name === null) return;
                                const price = Number(
                                  prompt(
                                    "Package price in INR",
                                    String(p.price),
                                  ),
                                );
                                if (!Number.isFinite(price) || price < 0)
                                  return;
                                await api(`/admin/packages/${p.id}`, {
                                  method: "PUT",
                                  body: JSON.stringify({ ...p, name, price }),
                                });
                                load();
                              }}
                            >
                              Edit
                            </button>
                            {p.active ? (
                              <button
                                className="table-link"
                                onClick={async () => {
                                  if (confirm(`Delete package ${p.name}?`)) {
                                    try {
                                      await api(`/admin/packages/${p.id}`, {
                                        method: "DELETE",
                                      });
                                      load();
                                    } catch (err) {
                                      alert((err as Error).message);
                                    }
                                  }
                                }}
                              >
                                Delete
                              </button>
                            ) : (
                              <button
                                className="table-link"
                                onClick={async () => {
                                  await api(`/admin/packages/${p.id}`, {
                                    method: "PUT",
                                    body: JSON.stringify({ ...p, active: 1 }),
                                  });
                                  load();
                                }}
                              >
                                Reactivate
                              </button>
                            )}
                          </td>
                        </tr>
                      )),
                    )}
                  </tbody>
                </table>
              </div>
            </>
          )}
          {tab === "customers" && (
            <>
              <div className="catalog-toolbar">
                <label className="searchbox">
                  <Search size={16} />
                  <input
                    placeholder="Search customers by name or email"
                    value={customerSearch}
                    onChange={(e) => setCustomerSearch(e.target.value)}
                  />
                </label>
                <span>{customers.length} registered</span>
              </div>
              <div className="data-table-wrap">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Customer</th>
                      <th>Email</th>
                      <th>Joined</th>
                      <th></th>
                    </tr>
                  </thead>
                  <tbody>
                    {customers
                      .filter((c: any) =>
                        `${c.name} ${c.email}`
                          .toLowerCase()
                          .includes(customerSearch.toLowerCase()),
                      )
                      .map((c: any) => (
                        <tr key={c.id}>
                          <td>
                            <b>{c.name}</b>
                          </td>
                          <td>{c.email}</td>
                          <td>{dateText(String(c.created_at).slice(0, 10))}</td>
                          <td>
                            <button
                              className="table-link"
                              onClick={async () => {
                                if (
                                  !confirm(
                                    `Delete ${c.name}'s account and private planning data?`,
                                  )
                                )
                                  return;
                                try {
                                  await api(`/admin/customers/${c.id}`, {
                                    method: "DELETE",
                                  });
                                  setCustomers(
                                    customers.filter((x: any) => x.id !== c.id),
                                  );
                                } catch (err) {
                                  alert((err as Error).message);
                                }
                              }}
                            >
                              Delete
                            </button>
                          </td>
                        </tr>
                      ))}
                  </tbody>
                </table>
                {!customers.length && (
                  <div className="table-empty">No customer accounts yet.</div>
                )}
              </div>
            </>
          )}
          {tab === "reviews" && (
            <div className="data-table-wrap">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Customer</th>
                    <th>Booking</th>
                    <th>Rating</th>
                    <th>Review</th>
                    <th>Status</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {reviews.map((r: any) => (
                    <tr key={r.id}>
                      <td>{r.customer}</td>
                      <td>{r.title}</td>
                      <td>{r.rating}/5</td>
                      <td>{r.body}</td>
                      <td>
                        <Status status={r.status} />
                      </td>
                      <td>
                        {r.status === "Hidden" || r.status === "Pending" ? (
                          <button
                            className="table-link"
                            onClick={() => moderate(r.id, "Published")}
                          >
                            Publish
                          </button>
                        ) : (
                          <button
                            className="table-link"
                            onClick={() => moderate(r.id, "Hidden")}
                          >
                            Hide
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {!reviews.length && (
                <div className="table-empty">
                  There are no reviews to moderate.
                </div>
              )}
            </div>
          )}
        </>
      )}
    </>
  );
}
