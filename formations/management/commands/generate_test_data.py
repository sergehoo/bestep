import random
import uuid
from datetime import timedelta

from django.core.management.base import BaseCommand
from django.contrib.auth import get_user_model
from django.db import transaction
from django.utils import timezone
from django.utils.text import slugify

from catalog.models import (
    Category, Course, CourseSection, Lesson, MediaAsset, Payment, Notification
)

# Si tu as organizations.Company et que tu veux l'utiliser, décommente :
# from organizations.models import Company

User = get_user_model()


FIRST_NAMES = ["Awa", "Koffi", "Serge", "Fatou", "Jean", "Mariam", "Yao", "Nadia", "Ismael", "Ruth"]
LAST_NAMES = ["Koné", "Traoré", "Kouassi", "Diabaté", "Ouattara", "N'Guessan", "Diallo", "Touré", "Yapi", "Doumbia"]
COURSE_TITLES = [
    "Budget personnel & épargne",
    "Gestion financière pour entrepreneurs",
    "Comptabilité simplifiée",
    "Investissement & diversification",
    "Finance d’entreprise - fondamentaux",
    "Conformité & procédures internes",
    "Analyse financière - ratios clés",
    "Planification retraite",
    "Trésorerie & cashflow",
    "Introduction aux marchés financiers",
]


def rand_phone_ci():
    # Format simple CI : 07xxxxxxxx (10 chiffres) — adapte si besoin
    return "07" + "".join(str(random.randint(0, 9)) for _ in range(8))


class Command(BaseCommand):
    help = "Génère des données test (>=1000 lignes) pour Category/Course/Section/Lesson/MediaAsset/Payment/Notification"

    def add_arguments(self, parser):
        parser.add_argument("--users", type=int, default=50)
        parser.add_argument("--courses", type=int, default=100)
        parser.add_argument("--seed", type=int, default=42)

    @transaction.atomic
    def handle(self, *args, **options):
        random.seed(options["seed"])

        nb_users = options["users"]
        nb_courses = options["courses"]

        self.stdout.write("🚀 Génération des données test...")

        # -------- Categories --------
        REAL_CATEGORIES = [
            "Épargne & finances personnelles",
            "Investissement",
            "Entrepreneuriat",
            "Comptabilité",
            "Gestion de trésorerie",
            "Fiscalité ivoirienne",
            "Gestion de patrimoine",
            "Marchés financiers",
            "Conformité d’entreprise",
            "Finance pour PME",
            "Microfinance",
            "Assurances",
            "Retraite & prévoyance",
            "Éducation bancaire",
            "Gestion budgétaire",
            "Analyse des coûts",
            "Finance publique",
            "Audit interne",
            "Leadership financier",
            "Digitalisation des finances",
        ]
        categories = []
        for name in REAL_CATEGORIES:
            cat, _ = Category.objects.get_or_create(
                name=name,
                defaults={"slug": slugify(name)[:140]},
            )
            categories.append(cat)
        self.stdout.write("✅ Catégories créées")

        # -------- Users (custom user: pas de username) --------
        users = []
        for i in range(nb_users):
            first = random.choice(FIRST_NAMES)
            last = random.choice(LAST_NAMES)
            full_name = f"{first} {last}"
            email = f"user{i+1}@test.com"

            # On utilise email comme identifiant unique
            u = User.objects.filter(email=email).first()
            if not u:
                u = User(email=email)

                # full_name existe chez toi (vu dans la liste des champs)
                if hasattr(u, "full_name"):
                    u.full_name = full_name

                # phone existe chez toi
                if hasattr(u, "phone"):
                    u.phone = rand_phone_ci()

                # role existe chez toi (optionnel)
                if hasattr(u, "role") and not getattr(u, "role", None):
                    u.role = getattr(u.__class__, "Role", None) and u.__class__.Role.LEARNER if hasattr(u.__class__, "Role") else getattr(u, "role", None)

                # Mot de passe
                u.set_password("Test@12345")
                u.is_active = True
                u.save()

            users.append(u)

        self.stdout.write(f"✅ Utilisateurs créés: {len(users)}")

        # -------- Courses --------
        courses = []
        for i in range(nb_courses):
            title = random.choice(COURSE_TITLES) + f" ({i+1})"
            instructor = random.choice(users)
            category = random.choice(categories)

            pricing = random.choice(list(Course.PricingType.values))
            course_type = random.choice(list(Course.CourseType.values))

            course = Course.objects.create(
                title=title,
                subtitle="Formation pratique + cas réels",
                description="Contenu de démonstration généré automatiquement pour tests.",
                category=category,
                instructor=instructor,
                course_type=course_type,
                pricing_type=pricing,
                price=0 if pricing == Course.PricingType.FREE else random.randint(5000, 150000),
                currency="XOF",
                status=Course.Status.PUBLISHED,
                published_at=timezone.now() - timedelta(days=random.randint(0, 120)),
                company_only=False,
            )
            courses.append(course)

        self.stdout.write(f"✅ Cours créés: {len(courses)}")

        # -------- Sections --------
        sections = []
        for c in courses:
            nb_sections = 5
            for j in range(nb_sections):
                sections.append(
                    CourseSection.objects.create(
                        course=c,
                        title=f"Section {j+1} — {c.title}",
                        order=j + 1,
                    )
                )
        self.stdout.write(f"✅ Sections créées: {len(sections)}")

        # -------- MediaAssets --------
        media_assets = []
        for i in range(200):
            kind = random.choice(list(MediaAsset.Kind.values))
            asset = MediaAsset.objects.create(
                owner=random.choice(users),
                kind=kind,
                title=f"{kind.upper()} Asset {i+1}",
                object_key=f"minio/{kind}/{uuid.uuid4()}",
                content_type="video/mp4" if kind == MediaAsset.Kind.VIDEO else "application/pdf",
                size=random.randint(50_000, 50_000_000),
                duration_seconds=random.randint(30, 3600) if kind == MediaAsset.Kind.VIDEO else None,
            )
            media_assets.append(asset)
        self.stdout.write(f"✅ MediaAssets créés: {len(media_assets)}")

        # -------- Lessons (>=1000) --------
        lessons_count = 0
        for s in sections:
            # 2 à 4 leçons par section => 500 sections -> 1000 à 2000 lessons
            nb_lessons = random.randint(2, 4)
            for k in range(nb_lessons):
                lt = random.choice(list(Lesson.LessonType.values))
                is_preview = random.choice([True, False])

                lesson = Lesson.objects.create(
                    section=s,
                    title=f"Leçon {k+1} — {s.title}",
                    order=k + 1,
                    lesson_type=lt,
                    is_preview=is_preview,
                    duration_sec=random.randint(60, 1800),
                    content="Contenu de test (texte) généré automatiquement." if lt in (Lesson.LessonType.TEXT, Lesson.LessonType.QUIZ) else "",
                    video_url="",
                    media_asset=random.choice(media_assets) if random.random() < 0.7 else None,
                )
                lessons_count += 1

        self.stdout.write(f"✅ Leçons créées: {lessons_count}")

        # -------- Payments --------
        payments_count = 500
        for i in range(payments_count):
            user = random.choice(users)
            course = random.choice(courses)

            Payment.objects.create(
                user=user,
                course_id=course.id,
                kind=Payment.Kind.COURSE,
                status=random.choice([Payment.Status.PAID, Payment.Status.PENDING, Payment.Status.FAILED]),
                reference=f"PAY-{uuid.uuid4().hex[:12].upper()}",
                provider=random.choice(["CinetPay", "OrangeMoney", "MTNMoney", "MoovMoney"]),
                provider_ref=uuid.uuid4().hex[:16],
                amount=0 if course.pricing_type == Course.PricingType.FREE else course.price,
                currency=course.currency,
                description=f"Achat du cours: {course.title}",
                meta={"seed": True},
                paid_at=timezone.now() - timedelta(days=random.randint(0, 60)) if random.random() < 0.7 else None,
            )

        self.stdout.write(f"✅ Paiements créés: {payments_count}")

        # -------- Notifications --------
        notifs_count = 500
        for i in range(notifs_count):
            user = random.choice(users)
            Notification.objects.create(
                user=user,
                title=f"Notification #{i+1}",
                body="Ceci est une notification de test générée automatiquement.",
                level=random.choice(list(Notification.Level.values)),
                is_read=random.choice([True, False]),
                action_url=random.choice(["", "/dashboard/", "/courses/"]),
            )
        self.stdout.write(f"✅ Notifications créées: {notifs_count}")

        self.stdout.write(self.style.SUCCESS("🎉 Données test générées avec succès !"))
        self.stdout.write(f"Résumé: users={len(users)}, courses={len(courses)}, sections={len(sections)}, lessons={lessons_count}, assets={len(media_assets)}, payments={payments_count}, notifs={notifs_count}")