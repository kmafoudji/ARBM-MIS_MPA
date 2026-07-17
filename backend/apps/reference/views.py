"""
Vues referentiels (SF-2 / gouvernance des classifications).

Lecture : tout utilisateur authentifie (les referentiels alimentent les
formulaires projet de tous les acteurs).
Ecriture : reservee aux roles portant create/update/delete sur
m1_config_access — soit, dans la matrice SFD, LLFMU aRBM Specialist
("gouvernance des classifications") et Data & Digital Analyst.
"""
from rest_framework import viewsets
from rest_framework.permissions import IsAuthenticated

from apps.identity.permissions import ReadOnlyOrHasModulePermission

from .models import Country, Donor, ImplementingAgency, RegionalHub, Sdg, Sector
from .serializers import (
    CountrySerializer,
    DonorSerializer,
    ImplementingAgencySerializer,
    RegionalHubSerializer,
    SdgSerializer,
    SectorSerializer,
)


class ReferenceViewSet(viewsets.ModelViewSet):
    """Base commune : lecture ouverte, ecriture soumise au RBAC."""

    permission_classes = [IsAuthenticated, ReadOnlyOrHasModulePermission]
    permission_module = "m1_config_access"
    pagination_class = None


class CountryViewSet(ReferenceViewSet):
    queryset = Country.objects.select_related("hub").all()
    serializer_class = CountrySerializer


class RegionalHubViewSet(ReferenceViewSet):
    queryset = RegionalHub.objects.prefetch_related("countries").all()
    serializer_class = RegionalHubSerializer


class DonorViewSet(ReferenceViewSet):
    queryset = Donor.objects.all()
    serializer_class = DonorSerializer


class ImplementingAgencyViewSet(ReferenceViewSet):
    queryset = ImplementingAgency.objects.select_related("country").all()
    serializer_class = ImplementingAgencySerializer


class SectorViewSet(ReferenceViewSet):
    queryset = Sector.objects.all().order_by("name")
    serializer_class = SectorSerializer


class SdgViewSet(ReferenceViewSet):
    queryset = Sdg.objects.all().order_by("number")
    serializer_class = SdgSerializer
