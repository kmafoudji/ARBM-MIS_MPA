from rest_framework import viewsets
from rest_framework.permissions import IsAuthenticated

from .models import Country, Sdg, Sector
from .serializers import CountrySerializer, SdgSerializer, SectorSerializer


class CountryViewSet(viewsets.ReadOnlyModelViewSet):
    queryset = Country.objects.all().order_by("name")
    serializer_class = CountrySerializer
    permission_classes = [IsAuthenticated]
    pagination_class = None


class SectorViewSet(viewsets.ReadOnlyModelViewSet):
    queryset = Sector.objects.all().order_by("name")
    serializer_class = SectorSerializer
    permission_classes = [IsAuthenticated]
    pagination_class = None


class SdgViewSet(viewsets.ReadOnlyModelViewSet):
    queryset = Sdg.objects.all().order_by("number")
    serializer_class = SdgSerializer
    permission_classes = [IsAuthenticated]
    pagination_class = None
