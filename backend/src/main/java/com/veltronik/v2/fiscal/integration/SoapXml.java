package com.veltronik.v2.fiscal.integration;

import org.w3c.dom.Document;
import org.w3c.dom.NodeList;

import javax.xml.parsers.DocumentBuilder;
import javax.xml.parsers.DocumentBuilderFactory;
import java.io.ByteArrayInputStream;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.List;

/**
 * Parseo defensivo de las respuestas SOAP de ARCA. Extrae por nombre local de tag
 * (las respuestas usan namespace por defecto, sin prefijo en los elementos de interés).
 *
 * <p>Seguro contra XXE: deshabilita DTDs y entidades externas.</p>
 */
final class SoapXml {

    private SoapXml() {}

    static Document parse(String xml) {
        try {
            DocumentBuilderFactory f = DocumentBuilderFactory.newInstance();
            f.setFeature("http://apache.org/xml/features/disallow-doctype-decl", true);
            f.setFeature("http://xml.org/sax/features/external-general-entities", false);
            f.setFeature("http://xml.org/sax/features/external-parameter-entities", false);
            f.setExpandEntityReferences(false);
            DocumentBuilder b = f.newDocumentBuilder();
            return b.parse(new ByteArrayInputStream(xml.getBytes(StandardCharsets.UTF_8)));
        } catch (Exception e) {
            throw new ArcaException("Respuesta de ARCA ilegible: " + e.getMessage(), e);
        }
    }

    /** Texto del primer elemento con ese nombre local, o null si no está. */
    static String firstText(Document doc, String localTag) {
        NodeList nl = doc.getElementsByTagName(localTag);
        return nl.getLength() > 0 ? nl.item(0).getTextContent() : null;
    }

    static String firstText(String xml, String localTag) {
        return firstText(parse(xml), localTag);
    }

    /** Todos los textos de los elementos con ese nombre local (para juntar Obs/Err). */
    static List<String> allText(Document doc, String localTag) {
        List<String> out = new ArrayList<>();
        NodeList nl = doc.getElementsByTagName(localTag);
        for (int i = 0; i < nl.getLength(); i++) {
            out.add(nl.item(i).getTextContent());
        }
        return out;
    }
}
