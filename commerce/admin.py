from django.contrib import admin

# Register your models here.
from django.contrib import admin
from .models import Coupon, Order, OrderItem, PaymentTransaction, CompanyLicense, CompanyAssignment, \
    CompanyAssignmentTarget


class OrderItemInline(admin.TabularInline):
    model = OrderItem
    extra = 0
    fields = ("item_type", "course", "seats_qty", "unit_price", "line_total")


class PaymentTransactionInline(admin.TabularInline):
    model = PaymentTransaction
    extra = 0
    fields = ("provider", "reference", "status", "amount", "currency", "created_at")
    readonly_fields = ("created_at",)


@admin.register(Order)
class OrderAdmin(admin.ModelAdmin):
    list_display = ("id", "user", "company", "status", "total", "currency", "created_at", "paid_at")
    list_filter = ("status", "currency")
    search_fields = ("id", "user__email", "company__name")
    readonly_fields = ("created_at", "paid_at")
    inlines = [OrderItemInline, PaymentTransactionInline]


@admin.register(Coupon)
class CouponAdmin(admin.ModelAdmin):
    list_display = (
    "code", "is_active", "percent_off", "amount_off", "currency", "used_count", "usage_limit", "valid_from", "valid_to")
    list_filter = ("is_active", "currency")
    search_fields = ("code",)


@admin.register(PaymentTransaction)
class PaymentTransactionAdmin(admin.ModelAdmin):
    list_display = ("order", "provider", "reference", "status", "amount", "currency", "created_at")
    list_filter = ("provider", "status", "currency")
    search_fields = ("reference", "order__id")


@admin.register(CompanyLicense)
class CompanyLicenseAdmin(admin.ModelAdmin):
    list_display = ("company", "seats_total", "seats_used", "valid_until", "created_at")
    list_filter = ("company",)


class CompanyAssignmentTargetInline(admin.TabularInline):
    model = CompanyAssignmentTarget
    extra = 0


@admin.register(CompanyAssignment)
class CompanyAssignmentAdmin(admin.ModelAdmin):
    list_display = ("company", "course", "assigned_by", "due_date", "created_at")
    list_filter = ("company",)
    search_fields = ("company__name", "course__title")
    inlines = [CompanyAssignmentTargetInline]
