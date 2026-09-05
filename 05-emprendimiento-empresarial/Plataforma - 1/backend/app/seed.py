from app.core.database import Base, SessionLocal, engine
from app.core.security import hash_password
from app.models import Asset, AssetType, Organization, User


def seed() -> None:
    Base.metadata.create_all(bind=engine)
    db = SessionLocal()
    try:
        org = db.query(Organization).filter(Organization.name == "Institucion Demo Guatemala").first()
        if not org:
            org = Organization(name="Institucion Demo Guatemala", sector="public")
            db.add(org)
            db.commit()
            db.refresh(org)

        user = db.query(User).filter(User.email == "admin@demo.gt").first()
        if not user:
            db.add(
                User(
                    organization_id=org.id,
                    email="admin@demo.gt",
                    full_name="Administrador Demo",
                    hashed_password=hash_password("ChangeMe123!"),
                    role="admin",
                    mfa_enabled=False,
                    mfa_verified=True,
                )
            )

        if not db.query(Asset).filter(Asset.organization_id == org.id).first():
            db.add_all(
                [
                    Asset(
                        organization_id=org.id,
                        name="Sistema de gestion documental",
                        asset_type=AssetType.software,
                        owner="Direccion de Tecnologia",
                        criticality=5,
                        location="Servidor central, sede del Ministerio",
                        description="Gestion de expedientes, resoluciones y archivo digital de la institucion.",
                    ),
                    Asset(
                        organization_id=org.id,
                        name="Red LAN de la sede central",
                        asset_type=AssetType.hardware,
                        owner="Unidad de Infraestructura",
                        criticality=4,
                        location="Edificio central",
                        description="Conectividad de oficinas, impresoras y servicios internos de la sede.",
                    ),
                ]
            )
        db.commit()
        print("Seed completed. Login: admin@demo.gt / ChangeMe123!")
    finally:
        db.close()


if __name__ == "__main__":
    seed()
