"""
Vues referentiels (gouvernance des classifications).

Lecture : tout utilisateur authentifie (les referentiels alimentent les
formulaires projet de tous les acteurs).
Ecriture : reservee aux roles portant create/update/delete sur
m1_config_access — soit, dans la matrice SFD, LLFMU aRBM Specialist
("gouvernance des classifications") et Data & Digital Analyst.

POL-1.07 : pas de suppression definitive. DELETE desactive (is_active=False)
au lieu de detruire. Un element desactive reste attache aux donnees qui le
referencent deja ; il n'est simplement plus proposable pour de nouvelles
saisies.
"""
from rest_framework import status, viewsets
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from apps.identity.permissions import ReadOnlyOrHasModulePermission

from .models import Country, Currency, Donor, ImplementingAgency, RegionalHub, Sdg, Sector
from .serializers import (
    CurrencySerializer,
    CountrySerializer,
    DonorSerializer,
    ImplementingAgencySerializer,
    RegionalHubSerializer,
    SdgSerializer,
    SectorSerializer,
)


class ReferenceViewSet(viewsets.ModelViewSet):
    """Base commune : lecture ouverte, ecriture soumise au RBAC, soft-delete."""

    permission_classes = [IsAuthenticated, ReadOnlyOrHasModulePermission]
    permission_module = "m1_config_access"
    pagination_class = None

    def destroy(self, request, *args, **kwargs):
        """
        POL-1.07 : desactive au lieu de supprimer.

        La permission RBAC requise reste `delete` — c'est bien l'acte de
        retirer un element du referentiel, seule son implementation est
        reversible.
        """
        instance = self.get_object()
        instance.is_active = False
        instance.save(update_fields=["is_active"])
        return Response(self.get_serializer(instance).data, status=status.HTTP_200_OK)


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


class CurrencyViewSet(ReferenceViewSet):
    queryset = Currency.objects.all().order_by("code")
    serializer_class = CurrencySerializer
    # Les devises ne se desactivent pas — liste stable
    http_method_names = ["get", "head", "options"]


class CrossCuttingThemeViewSet(ReferenceViewSet):
    from apps.reference.serializers import CrossCuttingThemeSerializer
    serializer_class = CrossCuttingThemeSerializer
    queryset = CrossCuttingTheme.objects.all().order_by("name")

class SdgViewSet(ReferenceViewSet):
    """
    Les 17 ODD sont un referentiel ferme, fixe par les Nations Unies : ni
    creation, ni suppression. Seule la mise a jour est ouverte (libelle,
    couleur), pour la traduction et les ajustements d'affichage.
    """

    queryset = Sdg.objects.all().order_by("number")
    serializer_class = SdgSerializer
    http_method_names = ["get", "patch", "put", "head", "options"]
