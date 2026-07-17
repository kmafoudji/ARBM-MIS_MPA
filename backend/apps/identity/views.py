from rest_framework import viewsets
from rest_framework.permissions import IsAuthenticated

from .models import AppUser
from .serializers import AppUserSerializer


class AppUserViewSet(viewsets.ReadOnlyModelViewSet):
    """
    Expose la liste des utilisateurs (email/nom) pour peupler des
    selecteurs cote frontend (ex. second approbateur d'une transition
    d'etape SF-4). Pas de donnees sensibles exposees ici.
    """

    queryset = AppUser.objects.filter(is_active=True).order_by("email")
    serializer_class = AppUserSerializer
    permission_classes = [IsAuthenticated]
    pagination_class = None
