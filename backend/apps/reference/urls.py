from rest_framework.routers import DefaultRouter

from .views import CountryViewSet, SdgViewSet, SectorViewSet

router = DefaultRouter()
router.register("countries", CountryViewSet, basename="country")
router.register("sectors", SectorViewSet, basename="sector")
router.register("sdgs", SdgViewSet, basename="sdg")

urlpatterns = router.urls
