function icon(name){
    const icons = {
      dashboard: `<svg class="w-5 h-5" viewBox="0 0 24 24" fill="none">
        <path d="M4 13h7V4H4v9Zm9 7h7V11h-7v9ZM4 20h7v-5H4v5Zm9-18v7h7V2h-7Z" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/>
      </svg>`,
      catalog: `<svg class="w-5 h-5" viewBox="0 0 24 24" fill="none">
        <path d="M4 19V5a2 2 0 0 1 2-2h12v16H6a2 2 0 0 0-2 2Z" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/>
        <path d="M8 7h8M8 11h8" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
      </svg>`,
      users: `<svg class="w-5 h-5" viewBox="0 0 24 24" fill="none">
        <path d="M17 21a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
        <path d="M9 13a4 4 0 1 0-4-4 4 4 0 0 0 4 4Z" stroke="currentColor" stroke-width="2"/>
        <path d="M23 21a4 4 0 0 0-3-3.87" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
        <path d="M16 3.13a4 4 0 0 1 0 7.75" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
      </svg>`,
      payments: `<svg class="w-5 h-5" viewBox="0 0 24 24" fill="none">
        <path d="M21 7H3V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v2Z" stroke="currentColor" stroke-width="2"/>
        <path d="M3 7v12a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V7" stroke="currentColor" stroke-width="2"/>
        <path d="M7 11h6" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
      </svg>`,
      settings: `<svg class="w-5 h-5" viewBox="0 0 24 24" fill="none">
        <path d="M12 15.5a3.5 3.5 0 1 0-3.5-3.5 3.5 3.5 0 0 0 3.5 3.5Z" stroke="currentColor" stroke-width="2"/>
        <path d="M19.4 15a1.7 1.7 0 0 0 .34 1.87l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06A1.7 1.7 0 0 0 15 19.4a1.7 1.7 0 0 0-1 .3 1.7 1.7 0 0 0-.87 1.47V21a2 2 0 1 1-4 0v-.09A1.7 1.7 0 0 0 8.1 19.4a1.7 1.7 0 0 0-1.87.34l-.06.06A2 2 0 1 1 3.34 17l.06-.06A1.7 1.7 0 0 0 4.6 15a1.7 1.7 0 0 0-.3-1 1.7 1.7 0 0 0-1.47-.87H2a2 2 0 1 1 0-4h.09A1.7 1.7 0 0 0 4.6 8.1a1.7 1.7 0 0 0-.34-1.87l-.06-.06A2 2 0 1 1 6.03 3.34l.06.06A1.7 1.7 0 0 0 8.1 4.6a1.7 1.7 0 0 0 1-.3 1.7 1.7 0 0 0 .87-1.47V2a2 2 0 1 1 4 0v.09A1.7 1.7 0 0 0 15.9 4.6a1.7 1.7 0 0 0 1.87-.34l.06-.06A2 2 0 1 1 20.66 6l-.06.06A1.7 1.7 0 0 0 19.4 8.1a1.7 1.7 0 0 0 .3 1 1.7 1.7 0 0 0 1.47.87H22a2 2 0 1 1 0 4h-.09A1.7 1.7 0 0 0 19.4 15Z" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
      </svg>`
    }
    return icons[name] || icons.dashboard;
  }

  function AdminApp(){
    return {
      sidebarOpen: true,
      route: "dashboard",
      q: "",
      range: "30d",
      nav: [
        { key:"dashboard", route:"dashboard", label:"Dashboard", icon: icon("dashboard") },
        { key:"courses", route:"courses", label:"Cours", icon: icon("catalog"), badge:"86" },
        { key:"users", route:"users", label:"Utilisateurs", icon: icon("users"), badge:"1.2k" },
        { key:"payments", route:"payments", label:"Paiements", icon: icon("payments"), badge:"12" },
        { key:"settings", route:"settings", label:"Paramètres", icon: icon("settings") },
      ],
      kpis: [],
      activity: [],
      popularCourses: [],
      notifications: [],
      init(){
        this.kpis = [
          { label:"Apprenants actifs", value:"1 284", delta:"+8.4%", deltaUp:true, tone:"sky", progress:78, icon: icon("users") },
          { label:"Cours publiés", value:"86", delta:"+2", deltaUp:true, tone:"sun", progress:64, icon: icon("catalog") },
          { label:"Taux complétion", value:"74%", delta:"+3.1%", deltaUp:true, tone:"sky", progress:74, icon: icon("dashboard") },
          { label:"Revenu (mois)", value:"8.4M XOF", delta:"-1.2%", deltaUp:false, tone:"sun", progress:52, icon: icon("payments") },
        ];
        this.activity = [
          { id:1, tone:"sky", icon: icon("users"), title:"12 nouveaux apprenants inscrits", time:"Il y a 12 min" },
          { id:2, tone:"sun", icon: icon("payments"), title:"Transaction confirmée", time:"Il y a 1h" },
          { id:3, tone:"sky", icon: icon("catalog"), title:"Cours soumis en validation", time:"Hier" },
        ];
        this.popularCourses = [
          { id:1, title:"Budget & Épargne intelligente", instructor:"A. Kouassi", type:"Certifiante", enrolled:920, completion:78, rating:"4.8" },
          { id:2, title:"Excel pour la Finance", instructor:"S. Diabaté", type:"Professionnelle", enrolled:1104, completion:71, rating:"4.6" },
          { id:3, title:"Procédures RH & conformité", instructor:"M. Traoré", type:"Interne", enrolled:640, completion:82, rating:"4.7" },
        ];
        this.notifications = [
          { id:1, title:"Nouvelle inscription", desc:"12 apprenants ont rejoint 'Budget & Épargne'." },
          { id:2, title:"Webhook paiement", desc:"Transaction SUCCESS confirmée." },
        ];
        const mq = window.matchMedia("(max-width: 1024px)");
        this.sidebarOpen = !mq.matches;
        mq.addEventListener?.("change", (e)=>{ this.sidebarOpen = !e.matches; });
      },
      goto(r){ this.route = r; if (window.innerWidth < 1024) this.sidebarOpen = false; },
      pageTitle(){
        return {
          dashboard:"Tableau de bord",
          courses:"Gestion des cours",
          users:"Gestion des utilisateurs",
          payments:"Paiements",
          settings:"Paramètres"
        }[this.route] || "Tableau de bord";
      },
      chartData(r){
        const d7 = [20,35,28,55,48,62,70,66,60,52,58,64];
        const d30 = [18,22,30,28,34,42,46,54,50,58,64,72];
        const d90 = [12,14,18,20,24,28,34,38,44,50,56,62];
        if (r==="7d") return d7;
        if (r==="90d") return d90;
        return d30;
      }
    }
  }
