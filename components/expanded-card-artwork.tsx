import { CardArtwork } from "@/components/card-artwork";
import styles from "./expanded-card-artwork.module.css";

export function ExpandedCardArtwork({ imageUrl }: { imageUrl: string }) {
  return <CardArtwork className={styles.artwork} eager imageUrl={imageUrl} name="拡大カード画像" sizes="(max-width: 600px) 95vw, 500px" />;
}
