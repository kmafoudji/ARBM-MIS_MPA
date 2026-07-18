from rest_framework import serializers

from .models import CHAIN_LEVEL_CHOICES, TheoryOfChange, ToCNode


class ToCNodeSerializer(serializers.ModelSerializer):
    chain_level_display = serializers.CharField(source="get_chain_level_display", read_only=True)

    class Meta:
        model = ToCNode
        fields = [
            "id", "parent", "code", "chain_level", "chain_level_display",
            "statement", "key_result_indicator", "means_of_verification",
            "assumptions", "risks_mitigation", "adaptation_strategy",
            "gender_climate_tag", "order", "created_at", "updated_at",
        ]
        # parent/chain_level ne sont editables qu'a la creation (via
        # create_toc_node, qui valide le rattachement et genere le code) —
        # les rendre modifiables ici casserait cette garantie sans passer
        # par le service. Reclasser = supprimer et recreer (cf. models.py).
        read_only_fields = [
            "id", "parent", "code", "chain_level", "chain_level_display",
            "created_at", "updated_at",
        ]


class ToCNodeCreateSerializer(serializers.Serializer):
    """
    Pas un ModelSerializer standard : le code hierarchique et la validation
    du rattachement passent par services.create_toc_node(), pas par la
    creation par defaut de DRF.
    """

    chain_level = serializers.ChoiceField(choices=CHAIN_LEVEL_CHOICES)
    parent = serializers.PrimaryKeyRelatedField(
        queryset=ToCNode.objects.all(), required=False, allow_null=True
    )
    statement = serializers.CharField()
    key_result_indicator = serializers.CharField(required=False, allow_blank=True, default="")
    means_of_verification = serializers.CharField(required=False, allow_blank=True, default="")
    assumptions = serializers.CharField(required=False, allow_blank=True, default="")
    risks_mitigation = serializers.CharField(required=False, allow_blank=True, default="")
    adaptation_strategy = serializers.CharField(required=False, allow_blank=True, default="")
    gender_climate_tag = serializers.CharField(required=False, allow_blank=True, default="")
    order = serializers.IntegerField(required=False, default=0)


class TheoryOfChangeSerializer(serializers.ModelSerializer):
    nodes = ToCNodeSerializer(many=True, read_only=True)
    status_display = serializers.CharField(source="get_status_display", read_only=True)
    project_name = serializers.CharField(source="project.name", read_only=True)
    project_code = serializers.CharField(source="project.code", read_only=True)

    class Meta:
        model = TheoryOfChange
        fields = [
            "id", "project", "project_name", "project_code",
            "version", "status", "status_display",
            "problem_statement", "ultimate_outcome",
            "nodes", "created_at", "updated_at",
        ]
        read_only_fields = [
            "id", "project", "project_name", "project_code", "version",
            "status_display", "nodes", "created_at", "updated_at",
        ]


class TheoryOfChangeUpdateSerializer(serializers.ModelSerializer):
    class Meta:
        model = TheoryOfChange
        fields = ["status", "problem_statement", "ultimate_outcome"]
